// Server-only Postgres access for Phase 6 cloud sync (ARCHITECTURE.md
// §6). Uses postgres.js directly rather than an ORM — the schema is
// three tables, not worth pulling in Prisma for.
//
// Column names are quoted, camelCase, and deliberately match the Dexie
// object shapes 1:1 (e.g. "scriptureId", "sourceUrl") so rows can be
// passed straight through to/from JSON without a separate mapping layer.
// Every table gets `updatedAt` (last-write-wins) and `deletedAt`
// (tombstone, so a delete on one device can propagate to others on
// pull — Postgres rows are never hard-deleted by sync, only marked).

import postgres from "postgres";

let sqlClient: ReturnType<typeof postgres> | null = null;

function getSql() {
  if (!sqlClient) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not configured on the server. Add it to .env.local for local dev (the pooled connection string from the Vercel Marketplace Neon integration's Quickstart panel), or to your Vercel project's environment variables for production."
      );
    }
    sqlClient = postgres(connectionString, { ssl: "require" });
  }
  return sqlClient;
}

let schemaReady: Promise<void> | null = null;

/**
 * Idempotent `create table if not exists` — no separate migration step
 * for a personal app with a three-table schema; just ensure it exists
 * before the first query each cold start. Memoized per server instance
 * so repeat requests don't re-run the DDL.
 */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = runMigrations().catch((err) => {
      // Don't cache a failure — a transient connection error on one
      // request shouldn't permanently wedge every request after it.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

async function runMigrations(): Promise<void> {
  const sql = getSql();

  await sql`
    create table if not exists scriptures (
      "id" text primary key,
      "title" text not null,
      "description" text,
      "sourceType" text not null,
      "youtubePlaylistId" text,
      "startDate" text,
      "targetDate" text,
      "createdAt" timestamptz not null,
      "updatedAt" timestamptz not null,
      "deletedAt" timestamptz
    )
  `;

  await sql`
    create table if not exists items (
      "id" text primary key,
      "scriptureId" text not null,
      "position" integer not null default 0,
      "type" text not null,
      "title" text not null,
      "thumbnailUrl" text,
      "sourceUrl" text,
      "durationSeconds" integer,
      "status" text not null,
      "dateCompleted" timestamptz,
      "notes" text,
      "watchedSeconds" integer,
      "lastPageViewed" integer,
      "targetPageCount" integer,
      "pdfStorage" text,
      "licenseUrl" text,
      "createdAt" timestamptz not null,
      "updatedAt" timestamptz not null,
      "deletedAt" timestamptz
    )
  `;

  await sql`
    create table if not exists watch_sessions (
      "id" text primary key,
      "itemId" text not null,
      "startedAt" timestamptz not null,
      "endedAt" timestamptz,
      "secondsWatched" integer not null default 0,
      "source" text not null,
      "updatedAt" timestamptz not null,
      "deletedAt" timestamptz
    )
  `;

  await sql`create index if not exists items_scripture_id_idx on items ("scriptureId")`;
  await sql`create index if not exists watch_sessions_item_id_idx on watch_sessions ("itemId")`;
  await sql`create index if not exists scriptures_updated_at_idx on scriptures ("updatedAt")`;
  await sql`create index if not exists items_updated_at_idx on items ("updatedAt")`;
  await sql`create index if not exists watch_sessions_updated_at_idx on watch_sessions ("updatedAt")`;
}

// --- Upsert-with-last-write-wins, one function per table ------------------
//
// Deliberately NOT built as one generic "upsert any table" helper: three
// small, explicit, hand-written functions are easier to audit for SQL
// injection (every column name below is a literal in this file, never
// interpolated from request input) than a dynamic column-list builder
// would be, and there are only three tables.
//
// Every call applies the same rule regardless of create/update/delete:
// upsert the full row, but only let it overwrite what's stored if the
// incoming updatedAt is strictly newer (`where <table>."updatedAt" <
// excluded."updatedAt"` — ARCHITECTURE.md §6's last-write-wins rule).
// A "delete" is just a row whose deletedAt is set; nothing is ever hard-
// deleted here, so pull-sync can tell other devices to remove it too.

export interface ScriptureRow {
  id: string;
  title: string;
  description?: string | null;
  sourceType: string;
  youtubePlaylistId?: string | null;
  startDate?: string | null;
  targetDate?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface ItemRow {
  id: string;
  scriptureId: string;
  position: number;
  type: string;
  title: string;
  thumbnailUrl?: string | null;
  sourceUrl?: string | null;
  durationSeconds?: number | null;
  status: string;
  dateCompleted?: string | null;
  notes?: string | null;
  watchedSeconds?: number | null;
  lastPageViewed?: number | null;
  targetPageCount?: number | null;
  pdfStorage?: string | null;
  licenseUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface WatchSessionRow {
  id: string;
  itemId: string;
  startedAt: string;
  endedAt?: string | null;
  secondsWatched: number;
  source: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export async function upsertScripture(row: ScriptureRow): Promise<void> {
  const sql = getSql();
  await sql`
    insert into scriptures
      ("id", "title", "description", "sourceType", "youtubePlaylistId", "startDate", "targetDate", "createdAt", "updatedAt", "deletedAt")
    values
      (${row.id}, ${row.title}, ${row.description ?? null}, ${row.sourceType}, ${row.youtubePlaylistId ?? null}, ${row.startDate ?? null}, ${row.targetDate ?? null}, ${row.createdAt}, ${row.updatedAt}, ${row.deletedAt ?? null})
    on conflict ("id") do update set
      "title" = excluded."title",
      "description" = excluded."description",
      "sourceType" = excluded."sourceType",
      "youtubePlaylistId" = excluded."youtubePlaylistId",
      "startDate" = excluded."startDate",
      "targetDate" = excluded."targetDate",
      "createdAt" = excluded."createdAt",
      "updatedAt" = excluded."updatedAt",
      "deletedAt" = excluded."deletedAt"
    where scriptures."updatedAt" < excluded."updatedAt"
  `;
}

export async function upsertItem(row: ItemRow): Promise<void> {
  const sql = getSql();
  await sql`
    insert into items
      ("id", "scriptureId", "position", "type", "title", "thumbnailUrl", "sourceUrl", "durationSeconds", "status", "dateCompleted", "notes", "watchedSeconds", "lastPageViewed", "targetPageCount", "pdfStorage", "licenseUrl", "createdAt", "updatedAt", "deletedAt")
    values
      (${row.id}, ${row.scriptureId}, ${row.position}, ${row.type}, ${row.title}, ${row.thumbnailUrl ?? null}, ${row.sourceUrl ?? null}, ${row.durationSeconds ?? null}, ${row.status}, ${row.dateCompleted ?? null}, ${row.notes ?? null}, ${row.watchedSeconds ?? null}, ${row.lastPageViewed ?? null}, ${row.targetPageCount ?? null}, ${row.pdfStorage ?? null}, ${row.licenseUrl ?? null}, ${row.createdAt}, ${row.updatedAt}, ${row.deletedAt ?? null})
    on conflict ("id") do update set
      "scriptureId" = excluded."scriptureId",
      "position" = excluded."position",
      "type" = excluded."type",
      "title" = excluded."title",
      "thumbnailUrl" = excluded."thumbnailUrl",
      "sourceUrl" = excluded."sourceUrl",
      "durationSeconds" = excluded."durationSeconds",
      "status" = excluded."status",
      "dateCompleted" = excluded."dateCompleted",
      "notes" = excluded."notes",
      "watchedSeconds" = excluded."watchedSeconds",
      "lastPageViewed" = excluded."lastPageViewed",
      "targetPageCount" = excluded."targetPageCount",
      "pdfStorage" = excluded."pdfStorage",
      "licenseUrl" = excluded."licenseUrl",
      "createdAt" = excluded."createdAt",
      "updatedAt" = excluded."updatedAt",
      "deletedAt" = excluded."deletedAt"
    where items."updatedAt" < excluded."updatedAt"
  `;
}

export async function upsertWatchSession(row: WatchSessionRow): Promise<void> {
  const sql = getSql();
  await sql`
    insert into watch_sessions
      ("id", "itemId", "startedAt", "endedAt", "secondsWatched", "source", "updatedAt", "deletedAt")
    values
      (${row.id}, ${row.itemId}, ${row.startedAt}, ${row.endedAt ?? null}, ${row.secondsWatched}, ${row.source}, ${row.updatedAt}, ${row.deletedAt ?? null})
    on conflict ("id") do update set
      "itemId" = excluded."itemId",
      "startedAt" = excluded."startedAt",
      "endedAt" = excluded."endedAt",
      "secondsWatched" = excluded."secondsWatched",
      "source" = excluded."source",
      "updatedAt" = excluded."updatedAt",
      "deletedAt" = excluded."deletedAt"
    where watch_sessions."updatedAt" < excluded."updatedAt"
  `;
}

export async function scripturesChangedSince(since: string | null): Promise<ScriptureRow[]> {
  const sql = getSql();
  return (since
    ? await sql`select * from scriptures where "updatedAt" > ${since} order by "updatedAt" asc`
    : await sql`select * from scriptures order by "updatedAt" asc`) as unknown as ScriptureRow[];
}

export async function itemsChangedSince(since: string | null): Promise<ItemRow[]> {
  const sql = getSql();
  return (since
    ? await sql`select * from items where "updatedAt" > ${since} order by "updatedAt" asc`
    : await sql`select * from items order by "updatedAt" asc`) as unknown as ItemRow[];
}

export async function watchSessionsChangedSince(since: string | null): Promise<WatchSessionRow[]> {
  const sql = getSql();
  return (since
    ? await sql`select * from watch_sessions where "updatedAt" > ${since} order by "updatedAt" asc`
    : await sql`select * from watch_sessions order by "updatedAt" asc`) as unknown as WatchSessionRow[];
}

export async function getServerTime(): Promise<string> {
  const sql = getSql();
  const [{ now }] = await sql<{ now: Date }[]>`select now() as now`;
  return now.toISOString();
}
