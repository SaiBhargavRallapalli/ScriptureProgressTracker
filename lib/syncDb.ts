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
//
// Phase 7 (accounts): every table also gets a "userId" column, populated
// exclusively from the caller's authenticated session (app/api/sync/route.ts)
// — never from request payload data — so one account's rows can never be
// read or overwritten by another's.

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
      "userId" text not null,
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
      "userId" text not null,
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
      "userId" text not null,
      "itemId" text not null,
      "startedAt" timestamptz not null,
      "endedAt" timestamptz,
      "secondsWatched" integer not null default 0,
      "source" text not null,
      "updatedAt" timestamptz not null,
      "deletedAt" timestamptz
    )
  `;

  // Backfill columns for a pre-Phase-7 database that already has these
  // tables without "userId" — harmless/no-op once every row has one.
  await sql`alter table scriptures add column if not exists "userId" text`;
  await sql`alter table items add column if not exists "userId" text`;
  await sql`alter table watch_sessions add column if not exists "userId" text`;

  await sql`create index if not exists scriptures_user_id_idx on scriptures ("userId")`;
  await sql`create index if not exists items_user_id_idx on items ("userId")`;
  await sql`create index if not exists watch_sessions_user_id_idx on watch_sessions ("userId")`;
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
// excluded."updatedAt"` — ARCHITECTURE.md §6's last-write-wins rule) —
// AND only within the same "userId" (`and <table>."userId" = excluded."userId"`),
// so even a colliding `id` across two different accounts' locally-
// generated UUIDs can never let one overwrite the other's row.

export interface ScriptureRow {
  id: string;
  userId: string;
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
  userId: string;
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
  userId: string;
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
      ("id", "userId", "title", "description", "sourceType", "youtubePlaylistId", "startDate", "targetDate", "createdAt", "updatedAt", "deletedAt")
    values
      (${row.id}, ${row.userId}, ${row.title}, ${row.description ?? null}, ${row.sourceType}, ${row.youtubePlaylistId ?? null}, ${row.startDate ?? null}, ${row.targetDate ?? null}, ${row.createdAt}, ${row.updatedAt}, ${row.deletedAt ?? null})
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
    where scriptures."userId" = excluded."userId" and scriptures."updatedAt" < excluded."updatedAt"
  `;
}

export async function upsertItem(row: ItemRow): Promise<void> {
  const sql = getSql();
  await sql`
    insert into items
      ("id", "userId", "scriptureId", "position", "type", "title", "thumbnailUrl", "sourceUrl", "durationSeconds", "status", "dateCompleted", "notes", "watchedSeconds", "lastPageViewed", "targetPageCount", "pdfStorage", "licenseUrl", "createdAt", "updatedAt", "deletedAt")
    values
      (${row.id}, ${row.userId}, ${row.scriptureId}, ${row.position}, ${row.type}, ${row.title}, ${row.thumbnailUrl ?? null}, ${row.sourceUrl ?? null}, ${row.durationSeconds ?? null}, ${row.status}, ${row.dateCompleted ?? null}, ${row.notes ?? null}, ${row.watchedSeconds ?? null}, ${row.lastPageViewed ?? null}, ${row.targetPageCount ?? null}, ${row.pdfStorage ?? null}, ${row.licenseUrl ?? null}, ${row.createdAt}, ${row.updatedAt}, ${row.deletedAt ?? null})
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
    where items."userId" = excluded."userId" and items."updatedAt" < excluded."updatedAt"
  `;
}

export async function upsertWatchSession(row: WatchSessionRow): Promise<void> {
  const sql = getSql();
  await sql`
    insert into watch_sessions
      ("id", "userId", "itemId", "startedAt", "endedAt", "secondsWatched", "source", "updatedAt", "deletedAt")
    values
      (${row.id}, ${row.userId}, ${row.itemId}, ${row.startedAt}, ${row.endedAt ?? null}, ${row.secondsWatched}, ${row.source}, ${row.updatedAt}, ${row.deletedAt ?? null})
    on conflict ("id") do update set
      "itemId" = excluded."itemId",
      "startedAt" = excluded."startedAt",
      "endedAt" = excluded."endedAt",
      "secondsWatched" = excluded."secondsWatched",
      "source" = excluded."source",
      "updatedAt" = excluded."updatedAt",
      "deletedAt" = excluded."deletedAt"
    where watch_sessions."userId" = excluded."userId" and watch_sessions."updatedAt" < excluded."updatedAt"
  `;
}

export async function scripturesChangedSince(userId: string, since: string | null): Promise<ScriptureRow[]> {
  const sql = getSql();
  return (since
    ? await sql`select * from scriptures where "userId" = ${userId} and "updatedAt" > ${since} order by "updatedAt" asc`
    : await sql`select * from scriptures where "userId" = ${userId} order by "updatedAt" asc`) as unknown as ScriptureRow[];
}

export async function itemsChangedSince(userId: string, since: string | null): Promise<ItemRow[]> {
  const sql = getSql();
  return (since
    ? await sql`select * from items where "userId" = ${userId} and "updatedAt" > ${since} order by "updatedAt" asc`
    : await sql`select * from items where "userId" = ${userId} order by "updatedAt" asc`) as unknown as ItemRow[];
}

export async function watchSessionsChangedSince(userId: string, since: string | null): Promise<WatchSessionRow[]> {
  const sql = getSql();
  return (since
    ? await sql`select * from watch_sessions where "userId" = ${userId} and "updatedAt" > ${since} order by "updatedAt" asc`
    : await sql`select * from watch_sessions where "userId" = ${userId} order by "updatedAt" asc`) as unknown as WatchSessionRow[];
}

/**
 * Ownership check for app/api/blob/file/route.ts — a Blob pathname's
 * entropy alone (Vercel's `addRandomSuffix: true`) makes it unguessable,
 * but every other read path in this app is scoped by userId, so this
 * route shouldn't be the one exception that relies solely on obscurity.
 * `sourceUrl` is exactly the string lib/items.ts's markPdfSavedToCloud
 * constructs (`/api/blob/file?pathname=...`), so an equality match is
 * exact — no LIKE/substring matching needed.
 */
export async function userOwnsItemWithSourceUrl(userId: string, sourceUrl: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    select 1 from items
    where "userId" = ${userId} and "sourceUrl" = ${sourceUrl} and "deletedAt" is null
    limit 1
  `;
  return rows.length > 0;
}

export async function getServerTime(): Promise<string> {
  const sql = getSql();
  const [{ now }] = await sql<{ now: Date }[]>`select now() as now`;
  return now.toISOString();
}

/**
 * One-time backfill for a pre-Phase-7 deployment's existing "ownerless"
 * rows (userId is null, from before accounts existed) — assigns them all
 * to whichever account runs it. Gated in the calling route to only the
 * configured LEGACY_ADMIN_EMAIL account, and only does anything the first
 * time (rows already have a userId after that).
 */
export async function claimLegacyRows(userId: string): Promise<{ scriptures: number; items: number; watchSessions: number }> {
  const sql = getSql();
  const [scriptures, items, watchSessions] = await Promise.all([
    sql`update scriptures set "userId" = ${userId} where "userId" is null`,
    sql`update items set "userId" = ${userId} where "userId" is null`,
    sql`update watch_sessions set "userId" = ${userId} where "userId" is null`,
  ]);
  return {
    scriptures: scriptures.count,
    items: items.count,
    watchSessions: watchSessions.count,
  };
}
