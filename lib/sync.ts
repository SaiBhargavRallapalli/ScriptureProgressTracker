// Client-side half of Phase 6 cloud sync (ARCHITECTURE.md §3/§6): push
// unsynced outbox rows to /api/sync in batches, apply whatever the
// server sends back into Dexie, and remember when that last succeeded.
//
// Everything the outbox needs gets queued automatically by the Dexie
// hooks in lib/db.ts — nothing here writes to scriptures/items/
// watchSessions directly except when *applying* a pull, which goes
// through withoutOutboxTracking() so it doesn't re-queue itself.

import { useLiveQuery } from "dexie-react-hooks";
import { db, withoutOutboxTracking, type Item, type OutboxEntry, type Scripture, type WatchSession } from "./db";

const META_KEYS = {
  syncToken: "syncToken",
  lastSyncedAt: "lastSyncedAt",
  since: "syncSince",
} as const;

const BATCH_SIZE = 50;

// --- Meta (per-device sync settings) --------------------------------------

async function getMeta(key: string): Promise<string | undefined> {
  const row = await db.meta.get(key);
  return row?.value;
}

async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

export async function getSyncToken(): Promise<string | undefined> {
  return getMeta(META_KEYS.syncToken);
}

export async function setSyncToken(token: string): Promise<void> {
  await setMeta(META_KEYS.syncToken, token.trim());
}

/** Reactive — Settings page uses this so the field/status update live. */
export function useSyncToken(): string | undefined {
  return useLiveQuery(() => getMeta(META_KEYS.syncToken), []);
}

export function useLastSyncedAt(): string | undefined {
  return useLiveQuery(() => getMeta(META_KEYS.lastSyncedAt), []);
}

export function useUnsyncedCount(): number | undefined {
  return useLiveQuery(() => db.outbox.count(), []);
}

// --- Applying a pulled row -------------------------------------------------
//
// Never `.put()` a pulled row wholesale — that would blow away local-only
// fields the server has no column for (Item.pdfBlob, the cached PDF
// bytes from Phase 4/4b). Instead: update-in-place if the row already
// exists locally (touches only the incoming keys, leaving pdfBlob
// alone), add it if it's new, or delete it locally if the incoming row
// is a tombstone (deletedAt set). Every path is gated on the same
// last-write-wins rule the server applies: skip entirely if the local
// copy is already the same age or newer.

type Incoming<T> = T & { updatedAt: string; deletedAt?: string | null };

/**
 * Strips deletedAt (a server/wire-only concept) and any `null`s
 * (Postgres's "unset" vs. Dexie's convention of just omitting the key)
 * before a row gets written into Dexie. Returns a plain object — the
 * caller casts it back to whatever shape `table.update`/`.add` expects.
 */
function cleanIncoming<T extends object>(incoming: T): T {
  const clean = { ...incoming } as Record<string, unknown>;
  delete clean.deletedAt;
  // Strip both null (Postgres's "unset") and undefined (defensive —
  // a real wire response never carries an explicit undefined since
  // JSON has no such value, but this must never be allowed to blow
  // away a local-only field like Item.pdfBlob regardless of how a
  // response object was constructed).
  for (const key of Object.keys(clean)) {
    if (clean[key] === null || clean[key] === undefined) delete clean[key];
  }
  return clean as unknown as T;
}

// Three concrete, non-generic appliers rather than one generic helper —
// Dexie's EntityTable.add()/.update() overloads don't unify cleanly
// through a synthetic generic interface, and there are only three
// tables, so the small duplication is worth the straightforward types.

async function applyIncomingScripture(incoming: Incoming<Scripture>): Promise<void> {
  const existing = await db.scriptures.get(incoming.id);
  if (existing && existing.updatedAt >= incoming.updatedAt) return;
  if (incoming.deletedAt) {
    if (existing) await db.scriptures.delete(incoming.id);
    return;
  }
  const clean = cleanIncoming(incoming) as unknown as Scripture;
  if (existing) await db.scriptures.update(incoming.id, clean);
  else await db.scriptures.add(clean);
}

async function applyIncomingItem(incoming: Incoming<Item>): Promise<void> {
  const existing = await db.items.get(incoming.id);
  if (existing && existing.updatedAt >= incoming.updatedAt) return;
  if (incoming.deletedAt) {
    if (existing) await db.items.delete(incoming.id);
    return;
  }
  const clean = cleanIncoming(incoming) as unknown as Item;
  if (existing) await db.items.update(incoming.id, clean);
  else await db.items.add(clean);
}

async function applyIncomingWatchSession(incoming: Incoming<WatchSession>): Promise<void> {
  const existing = await db.watchSessions.get(incoming.id);
  // WatchSession.updatedAt is optional for pre-Phase-6 rows (see lib/db.ts)
  // — treat a missing local value as "very old" so an incoming row always
  // wins against it.
  if (existing && (existing.updatedAt ?? "") >= incoming.updatedAt) return;
  if (incoming.deletedAt) {
    if (existing) await db.watchSessions.delete(incoming.id);
    return;
  }
  const clean = cleanIncoming(incoming) as unknown as WatchSession;
  if (existing) await db.watchSessions.update(incoming.id, clean);
  else await db.watchSessions.add(clean);
}

interface SyncChanges {
  scriptures: Incoming<Scripture>[];
  items: Incoming<Item>[];
  watchSessions: Incoming<WatchSession>[];
}

async function applyChanges(changes: SyncChanges): Promise<void> {
  await withoutOutboxTracking(async () => {
    for (const row of changes.scriptures) await applyIncomingScripture(row);
    for (const row of changes.items) await applyIncomingItem(row);
    for (const row of changes.watchSessions) await applyIncomingWatchSession(row);
  });
}

// --- Push + pull ------------------------------------------------------------

export type SyncResult =
  | { ok: true; pushed: number; pulled: number; lastSyncedAt: string }
  | { ok: false; error: string };

function outboxToBatchEntry(entry: OutboxEntry) {
  return {
    entityType: entry.entityType,
    operation: entry.operation,
    payload: entry.payload,
  };
}

/**
 * The only function that talks to /api/sync. Pushes whatever's queued
 * (in batches, oldest first), applies what comes back after every
 * batch, and always does at least one round trip — even with an empty
 * outbox — so pulling changes made on *other* devices doesn't require
 * having made a local edit first.
 */
export async function runSync(): Promise<SyncResult> {
  const token = await getSyncToken();
  if (!token) {
    return { ok: false, error: "No sync token set yet — paste one in Settings first." };
  }

  const pending = await db.outbox.orderBy("createdAt").toArray();
  const batches: OutboxEntry[][] = [];
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    batches.push(pending.slice(i, i + BATCH_SIZE));
  }
  if (batches.length === 0) batches.push([]); // still do one pull-only round trip

  let since = (await getMeta(META_KEYS.since)) ?? null;
  let pushed = 0;
  let pulled = 0;

  for (const batch of batches) {
    let res: Response;
    try {
      res = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ since, entries: batch.map(outboxToBatchEntry) }),
      });
    } catch {
      return { ok: false, error: "Couldn't reach the sync server — check your connection and try again." };
    }

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, error: body?.error || `Sync failed (HTTP ${res.status}).` };
    }

    const data = await res.json();

    await applyChanges(data.changes);
    pulled += data.changes.scriptures.length + data.changes.items.length + data.changes.watchSessions.length;

    if (batch.length > 0) {
      await db.outbox.bulkDelete(batch.map((e) => e.id));
      pushed += batch.length;
    }

    const serverTime: string = data.serverTime;
    since = serverTime;
    await setMeta(META_KEYS.since, serverTime);
  }

  const lastSyncedAt = new Date().toISOString();
  await setMeta(META_KEYS.lastSyncedAt, lastSyncedAt);

  return { ok: true, pushed, pulled, lastSyncedAt };
}

// --- "Back online" detection ------------------------------------------------
//
// navigator.onLine only reflects whether the device has *a* network
// interface up, not whether it can actually reach anything (ARCHITECTURE.md
// §3) — it can report `true` on a captive portal or a dead Wi-Fi hotspot.
// The real check is just: does a sync attempt's own fetch succeed? So the
// `online` event is only ever used as a trigger to *try*, never as
// confirmation on its own; runSync()'s fetch is the actual confirmation.

let registered = false;

export function registerOnlineSync(): void {
  if (registered || typeof window === "undefined") return;
  registered = true;

  window.addEventListener("online", () => {
    void runSync();
  });
}
