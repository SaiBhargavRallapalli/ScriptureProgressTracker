import { NextResponse } from "next/server";
import {
  ensureSchema,
  getServerTime,
  itemsChangedSince,
  scripturesChangedSince,
  upsertItem,
  upsertScripture,
  upsertWatchSession,
  watchSessionsChangedSince,
  type ItemRow,
  type ScriptureRow,
  type WatchSessionRow,
} from "@/lib/syncDb";

// POST /api/sync — the only sync endpoint (ARCHITECTURE.md §6).
// Protected by middleware.ts (bearer token), not here — this route
// trusts that anything reaching it already passed that check.
//
// Body: { since: string | null, entries: OutboxBatchEntry[] }
// - `entries` is a batch of the client's unsynced outbox rows, applied
//   with last-write-wins (lib/syncDb.ts's upsert*, gated on
//   updatedAt). Applying the same entry twice is harmless — the
//   comparison just fails to update the second time — so the client is
//   free to retry a failed batch wholesale rather than track partial
//   success.
// - `since` is the client's last-known-good server timestamp; anything
//   changed after it (across all three tables, from ANY device) comes
//   back in `changes`, along with a fresh `serverTime` to use as the
//   next `since`.

interface OutboxBatchEntry {
  entityType: "scripture" | "item" | "watchSession";
  operation: "create" | "update" | "delete";
  payload: Record<string, unknown>;
}

interface SyncRequestBody {
  since: string | null;
  entries: OutboxBatchEntry[];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function toScriptureRow(payload: Record<string, unknown>): ScriptureRow {
  const id = str(payload.id);
  const title = str(payload.title);
  const updatedAt = str(payload.updatedAt);
  const createdAt = str(payload.createdAt) ?? updatedAt;
  const sourceType = str(payload.sourceType) ?? "manual";
  if (!id || !title || !updatedAt) {
    throw new Error("Scripture payload missing id/title/updatedAt.");
  }
  return {
    id,
    title,
    description: str(payload.description) ?? null,
    sourceType,
    youtubePlaylistId: str(payload.youtubePlaylistId) ?? null,
    startDate: str(payload.startDate) ?? null,
    targetDate: str(payload.targetDate) ?? null,
    createdAt: createdAt!,
    updatedAt,
    deletedAt: str(payload.deletedAt) ?? null,
  };
}

function toItemRow(payload: Record<string, unknown>): ItemRow {
  const id = str(payload.id);
  const scriptureId = str(payload.scriptureId);
  const type = str(payload.type);
  const title = str(payload.title);
  const status = str(payload.status);
  const updatedAt = str(payload.updatedAt);
  const createdAt = str(payload.createdAt) ?? updatedAt;
  if (!id || !scriptureId || !type || !title || !status || !updatedAt) {
    throw new Error("Item payload missing a required field.");
  }
  return {
    id,
    scriptureId,
    position: num(payload.position) ?? 0,
    type,
    title,
    thumbnailUrl: str(payload.thumbnailUrl) ?? null,
    sourceUrl: str(payload.sourceUrl) ?? null,
    durationSeconds: num(payload.durationSeconds) ?? null,
    status,
    dateCompleted: str(payload.dateCompleted) ?? null,
    notes: str(payload.notes) ?? null,
    watchedSeconds: num(payload.watchedSeconds) ?? null,
    lastPageViewed: num(payload.lastPageViewed) ?? null,
    targetPageCount: num(payload.targetPageCount) ?? null,
    pdfStorage: str(payload.pdfStorage) ?? null,
    licenseUrl: str(payload.licenseUrl) ?? null,
    createdAt: createdAt!,
    updatedAt,
    deletedAt: str(payload.deletedAt) ?? null,
  };
}

function toWatchSessionRow(payload: Record<string, unknown>): WatchSessionRow {
  const id = str(payload.id);
  const itemId = str(payload.itemId);
  const startedAt = str(payload.startedAt);
  const source = str(payload.source);
  const updatedAt = str(payload.updatedAt) ?? str(payload.endedAt) ?? startedAt;
  if (!id || !itemId || !startedAt || !source || !updatedAt) {
    throw new Error("WatchSession payload missing a required field.");
  }
  return {
    id,
    itemId,
    startedAt,
    endedAt: str(payload.endedAt) ?? null,
    secondsWatched: num(payload.secondsWatched) ?? 0,
    source,
    updatedAt,
    deletedAt: str(payload.deletedAt) ?? null,
  };
}

export async function POST(request: Request) {
  let body: SyncRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.entries)) {
    return NextResponse.json({ error: "Expected `entries` to be an array." }, { status: 400 });
  }

  try {
    await ensureSchema();
  } catch (err) {
    console.error("Sync schema setup failed:", err);
    return NextResponse.json({ error: "Database is unavailable. Try again in a moment." }, { status: 502 });
  }

  let appliedCount = 0;
  const errors: string[] = [];

  for (const entry of body.entries) {
    try {
      if (entry.entityType === "scripture") {
        await upsertScripture(toScriptureRow(entry.payload));
      } else if (entry.entityType === "item") {
        await upsertItem(toItemRow(entry.payload));
      } else if (entry.entityType === "watchSession") {
        await upsertWatchSession(toWatchSessionRow(entry.payload));
      } else {
        throw new Error(`Unknown entityType: ${String(entry.entityType)}`);
      }
      appliedCount += 1;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Unknown error applying an entry.");
    }
  }

  try {
    const since = typeof body.since === "string" ? body.since : null;
    const [scriptures, items, watchSessions, serverTime] = await Promise.all([
      scripturesChangedSince(since),
      itemsChangedSince(since),
      watchSessionsChangedSince(since),
      getServerTime(),
    ]);

    return NextResponse.json({
      serverTime,
      appliedCount,
      errors,
      changes: { scriptures, items, watchSessions },
    });
  } catch (err) {
    console.error("Sync pull failed:", err);
    return NextResponse.json({ error: "Database is unavailable. Try again in a moment." }, { status: 502 });
  }
}
