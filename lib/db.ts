// Dexie (IndexedDB) schema for the Scripture & Sadhana Tracker.
//
// This is the app's local source of truth. All reads/writes happen against
// IndexedDB via Dexie — nothing here ever touches the network on its own.
// Phase 6 adds optional cloud sync: every write to scriptures/items/
// watchSessions is mirrored into the `outbox` table automatically (via the
// Dexie hooks registered below), and lib/sync.ts is the only thing that
// ever reads the network here.

import Dexie, { type EntityTable } from "dexie";

export interface Scripture {
  id: string;
  title: string;
  description?: string;
  sourceType: "youtube_playlist" | "manual" | "mixed";
  youtubePlaylistId?: string;
  startDate?: string;
  targetDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Item {
  id: string;
  scriptureId: string;
  position: number;
  type: "youtube_video" | "pdf" | "video_link";
  title: string;
  thumbnailUrl?: string;
  sourceUrl: string;
  durationSeconds?: number;
  status: "pending" | "in_progress" | "completed";
  dateCompleted?: string;
  notes?: string;
  watchedSeconds?: number;
  lastPageViewed?: number;
  // Phase 4: optional user-set page to treat as "done" for long PDFs where
  // reaching the literal last page isn't the realistic completion signal
  // (ARCHITECTURE.md §5.3). Falls back to the PDF's actual page count
  // when unset.
  targetPageCount?: number;
  pdfBlob?: Blob;
  pdfStorage?: "local" | "blob" | "link";
  licenseUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WatchSession {
  id: string;
  itemId: string;
  startedAt: string;
  endedAt?: string;
  secondsWatched: number;
  // "reading" (Phase 4): time spent with a PDF viewer visible/focused,
  // tracked the same way as video watch time (Page Visibility API pauses
  // it on hidden). Kept distinct from "manual" so a future dashboard can
  // tell "I timed myself reading this" apart from "I just clicked
  // complete with no tracking at all".
  source: "in_app_player" | "manual" | "reading";
  // Phase 6: needed for last-write-wins sync — WatchSession didn't carry
  // its own updatedAt before this, since nothing synced it anywhere.
  // Optional so pre-Phase-6 rows already in a device's IndexedDB stay
  // valid; always set on new writes going forward (lib/watchSessions.ts).
  updatedAt?: string;
}

export interface OutboxEntry {
  id: string;
  entityType: "scripture" | "item" | "watchSession";
  entityId: string;
  operation: "create" | "update" | "delete";
  payload: unknown;
  createdAt: string;
  synced: boolean;
}

// Phase 6: small local-only key/value store for sync bookkeeping
// (lastSyncedAt, the pull cursor, the pasted sync token). Never synced
// itself — it's per-device state, not app data.
export interface Meta {
  key: string;
  value: string;
}

class ScriptureTrackerDB extends Dexie {
  scriptures!: EntityTable<Scripture, "id">;
  items!: EntityTable<Item, "id">;
  watchSessions!: EntityTable<WatchSession, "id">;
  outbox!: EntityTable<OutboxEntry, "id">;
  meta!: EntityTable<Meta, "key">;

  constructor() {
    super("scripture-tracker");

    // Version 1: original four tables. targetPageCount, the "reading"
    // source value, and WatchSession.updatedAt above are new optional/
    // widened fields on existing objects, not new indexes — Dexie/
    // IndexedDB doesn't need a version bump for those, since objects are
    // schemaless beyond their declared indexes.
    this.version(1).stores({
      scriptures: "id, title, sourceType, createdAt, updatedAt",
      items:
        "id, scriptureId, [scriptureId+position], status, type, createdAt, updatedAt",
      watchSessions: "id, itemId, startedAt",
      outbox: "id, entityType, entityId, synced, createdAt",
    });

    // Version 2 (Phase 6): adds the `meta` table. A genuinely new object
    // store *does* need a version bump (unlike the field additions
    // above) — IndexedDB has to actually create the new store.
    this.version(2).stores({
      scriptures: "id, title, sourceType, createdAt, updatedAt",
      items:
        "id, scriptureId, [scriptureId+position], status, type, createdAt, updatedAt",
      watchSessions: "id, itemId, startedAt",
      outbox: "id, entityType, entityId, synced, createdAt",
      meta: "key",
    });

    registerOutboxHooks(this);
  }
}

// --- Outbox population (Phase 6) ------------------------------------------
//
// Every create/update/delete against scriptures/items/watchSessions should
// append an OutboxEntry so lib/sync.ts has something to push — see
// ARCHITECTURE.md §3/§6. Rather than hand-editing every mutator across
// lib/scriptures.ts/lib/items.ts/lib/watchSessions.ts (easy to miss one),
// this is done once, centrally, via Dexie's table hooks: they fire for
// every write to a table regardless of which function performed it,
// including bulkAdd and cascading `.where(...).delete()` calls.
//
// The outbox write happens in its OWN transaction (via
// Dexie.ignoreTransaction), not atomically with the primary write — the
// ambient transaction most call sites open only covers the table they're
// writing to, and pulling `outbox` into every one of them would mean
// touching all those call sites anyway, defeating the point. A crash in
// the split second between the two commits would drop one sync record;
// for a personal single-user app that's an acceptable, low-stakes
// tradeoff (ARCHITECTURE.md §6 makes the same call about conflicts in
// general: "real conflicts are rare and low-stakes here").

const ENTITY_TYPE_BY_TABLE: Record<string, OutboxEntry["entityType"]> = {
  scriptures: "scripture",
  items: "item",
  watchSessions: "watchSession",
};

// Set while lib/sync.ts is writing *pulled* server changes into Dexie —
// those writes shouldn't themselves re-queue an outbox entry, or every
// pull would immediately re-push the exact same data it just received.
let applyingRemoteChanges = false;

export async function withoutOutboxTracking<T>(fn: () => Promise<T>): Promise<T> {
  applyingRemoteChanges = true;
  try {
    return await fn();
  } finally {
    applyingRemoteChanges = false;
  }
}

function queueOutboxEntry(
  entityType: OutboxEntry["entityType"],
  entityId: string,
  operation: OutboxEntry["operation"],
  rawPayload: Record<string, unknown>
) {
  if (applyingRemoteChanges) return;

  // pdfBlob is a local-only cache of file bytes (Phase 4/4b) — it never
  // belongs in the sync payload: Postgres has no column for it, and the
  // actual PDF storage decision already goes through Vercel Blob or an
  // external link, not through sync.
  const payload = { ...rawPayload };
  if (entityType === "item") delete payload.pdfBlob;

  if (operation === "delete") {
    // Tombstone: stamp a fresh updatedAt so the deletion reliably wins
    // last-write-wins against any older, not-yet-synced edit to the same
    // row, and mark it so the server (and other devices, on pull) know
    // to remove it rather than upsert it.
    payload.updatedAt = new Date().toISOString();
    payload.deletedAt = payload.updatedAt;
  }

  const entry: OutboxEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    entityType,
    entityId,
    operation,
    payload,
    createdAt: new Date().toISOString(),
    synced: false,
  };

  Dexie.ignoreTransaction(() => {
    db.outbox.add(entry).catch((err) => {
      // Never let outbox bookkeeping fail the actual write the user is
      // waiting on — worst case, this one change gets picked up by
      // sync's periodic reconciliation instead of immediately queued.
      console.error("Failed to queue outbox entry:", err);
    });
  });
}

function registerOutboxHooks(dexie: Dexie) {
  for (const [tableName, entityType] of Object.entries(ENTITY_TYPE_BY_TABLE)) {
    const table = dexie.table(tableName);

    table.hook("creating", (primKey, obj) => {
      queueOutboxEntry(entityType, String(primKey ?? (obj as { id: string }).id), "create", {
        ...(obj as Record<string, unknown>),
      });
    });

    table.hook("updating", (modifications, primKey, obj) => {
      queueOutboxEntry(entityType, String(primKey), "update", {
        ...(obj as Record<string, unknown>),
        ...(modifications as Record<string, unknown>),
      });
    });

    table.hook("deleting", (primKey, obj) => {
      queueOutboxEntry(entityType, String(primKey), "delete", {
        ...(obj as Record<string, unknown>),
      });
    });
  }
}

// Single shared instance — import { db } from "@/lib/db" wherever needed.
export const db = new ScriptureTrackerDB();
