"use client";

// Opens the signed-in account's own IndexedDB database (see
// openUserDb()/closeUserDb() in lib/db.ts) before rendering anything that
// might query it, and offers a one-time, EXPLICITLY CONFIRMED claim of a
// pre-accounts single-user install's data into that account's new
// database — never automatic. A shared/public browser could otherwise
// have two different people's accounts log into it over time; silently
// attributing whatever old unnamespaced "scripture-tracker" database sits
// there to whichever account happens to log in first (and then syncs
// that claim to their other devices via lib/sync.ts) would leak the
// original owner's private notes/progress to a stranger's account. This
// is why "is this your data?" is a real, human-confirmed question, not an
// automatic migration step.

import { useEffect, useState } from "react";
import Dexie from "dexie";
import { closeUserDb, openUserDb, LEGACY_DB_NAME, type Item, type Scripture, type WatchSession } from "@/lib/db";

// The exact pre-Phase-7 schema, frozen here for one purpose only: reading
// out of the old unnamespaced database during the one-time migration
// below. Not the live schema (see lib/db.ts) — never change this to
// track future schema edits.
function openLegacyDb(): Dexie {
  const legacy = new Dexie(LEGACY_DB_NAME);
  legacy.version(1).stores({
    scriptures: "id, title, sourceType, createdAt, updatedAt",
    items: "id, scriptureId, [scriptureId+position], status, type, createdAt, updatedAt",
    watchSessions: "id, itemId, startedAt",
    outbox: "id, entityType, entityId, synced, createdAt",
  });
  legacy.version(2).stores({
    scriptures: "id, title, sourceType, createdAt, updatedAt",
    items: "id, scriptureId, [scriptureId+position], status, type, createdAt, updatedAt",
    watchSessions: "id, itemId, startedAt",
    outbox: "id, entityType, entityId, synced, createdAt",
    meta: "key",
  });
  return legacy;
}

async function markHandled(userId: string): Promise<void> {
  openUserDb(userId).meta.put({ key: "legacyDbMigrated", value: "true" });
}

/**
 * Returns true if this account should be asked "is this your data?" —
 * only when: unclaimed legacy data exists on this browser, AND this
 * account hasn't already answered that question, AND this account's own
 * database is still empty (an account that already has its own data was
 * never a first-login-on-this-browser case, so it's never offered
 * someone else's old data).
 */
async function needsLegacyClaimPrompt(userId: string): Promise<boolean> {
  const db = openUserDb(userId);

  const alreadyHandled = await db.meta.get("legacyDbMigrated");
  if (alreadyHandled) return false;

  const legacyExists = await Dexie.exists(LEGACY_DB_NAME);
  if (!legacyExists) {
    await markHandled(userId);
    return false;
  }

  const alreadyHasData = (await db.scriptures.count()) > 0;
  if (alreadyHasData) {
    await markHandled(userId);
    return false;
  }

  return true;
}

/** User confirmed "yes, this is my data." Copies it in, then deletes the
 * legacy database outright — closes the window for a LATER account
 * logging into this same browser to also claim (and sync) the same old
 * data into a second account. */
async function claimLegacyData(userId: string): Promise<void> {
  const db = openUserDb(userId);

  const legacy = openLegacyDb();
  await legacy.open();
  const [scriptures, items, watchSessions] = await Promise.all([
    legacy.table<Scripture, string>("scriptures").toArray(),
    legacy.table<Item, string>("items").toArray(),
    legacy.table<WatchSession, string>("watchSessions").toArray(),
  ]);
  legacy.close();

  await db.transaction("rw", db.scriptures, db.items, db.watchSessions, db.meta, async () => {
    if (scriptures.length) await db.scriptures.bulkAdd(scriptures);
    if (items.length) await db.items.bulkAdd(items);
    if (watchSessions.length) await db.watchSessions.bulkAdd(watchSessions);
    await db.meta.put({ key: "legacyDbMigrated", value: "true" });
  });

  await Dexie.delete(LEGACY_DB_NAME);
}

/** User said "no, start fresh." Deliberately does NOT touch the legacy
 * database — only remembers that THIS account isn't the one to claim
 * it, so whoever the actual rightful owner is can still claim it later
 * by logging into a different account on this same browser. */
async function declineLegacyClaim(userId: string): Promise<void> {
  await markHandled(userId);
}

type Phase = "checking" | "prompt" | "claiming" | "ready";

export default function DbProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    let cancelled = false;
    needsLegacyClaimPrompt(userId)
      .then((needsPrompt) => {
        if (!cancelled) setPhase(needsPrompt ? "prompt" : "ready");
      })
      .catch((err) => {
        // React (dev-mode Strict Mode) mounts, cleans up, and re-mounts
        // every effect once — the cleanup below closes the database this
        // in-flight check is still querying, which throws a
        // DatabaseClosedError. That's an expected artifact of the
        // synthetic double-invoke, not a real failure, so only surface
        // it when this run wasn't the one cancelled.
        if (cancelled) return;
        console.error("Failed to open local database:", err);
      });
    return () => {
      cancelled = true;
      closeUserDb();
    };
  }, [userId]);

  const handleClaim = async () => {
    setPhase("claiming");
    await claimLegacyData(userId);
    setPhase("ready");
  };

  const handleDecline = async () => {
    setPhase("claiming");
    await declineLegacyClaim(userId);
    setPhase("ready");
  };

  // Renders nothing (briefly, on first mount / account switch) rather
  // than letting a useLiveQuery hook fire against a database that isn't
  // open yet — see the Proxy in lib/db.ts, which throws in that case.
  if (phase === "checking") return null;

  if (phase === "prompt" || phase === "claiming") {
    return (
      <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 rounded-lg border border-amber-900/20 bg-white p-4 text-sm dark:border-amber-100/20 dark:bg-neutral-900">
        <p className="text-neutral-700 dark:text-neutral-300">
          This browser has scripture/item data saved from before accounts existed. Is it yours?
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClaim}
            disabled={phase === "claiming"}
            className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {phase === "claiming" ? "Working…" : "Yes, this is my data"}
          </button>
          <button
            type="button"
            onClick={handleDecline}
            disabled={phase === "claiming"}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            No, start fresh
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
