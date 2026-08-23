// Dexie (IndexedDB) schema for the Scripture & Sadhana Tracker.
//
// This is the app's local source of truth. All reads/writes happen against
// IndexedDB via Dexie — nothing here ever touches the network. Cloud sync
// (Phase 6) will read from / write to the `outbox` table added below, but
// nothing writes to it yet in Phase 0.

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

class ScriptureTrackerDB extends Dexie {
  scriptures!: EntityTable<Scripture, "id">;
  items!: EntityTable<Item, "id">;
  watchSessions!: EntityTable<WatchSession, "id">;
  // Set up now (Phase 0) even though nothing writes to it until Phase 6's
  // sync engine exists — adding a table later is a schema migration,
  // adding an unused one now is free.
  outbox!: EntityTable<OutboxEntry, "id">;

  constructor() {
    super("scripture-tracker");

    // Still version 1: targetPageCount and the "reading" source value are
    // new optional/widened fields on existing objects, not new indexes —
    // Dexie/IndexedDB doesn't need a version bump for that, since objects
    // are schemaless beyond their declared indexes.
    this.version(1).stores({
      scriptures: "id, title, sourceType, createdAt, updatedAt",
      items:
        "id, scriptureId, [scriptureId+position], status, type, createdAt, updatedAt",
      watchSessions: "id, itemId, startedAt",
      outbox: "id, entityType, entityId, synced, createdAt",
    });
  }
}

// Single shared instance — import { db } from "@/lib/db" wherever needed.
export const db = new ScriptureTrackerDB();
