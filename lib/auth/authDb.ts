// Server-only Postgres access for user accounts. Kept separate from
// lib/syncDb.ts (auth data vs. synced app data) but same style: postgres.js
// directly, no ORM, hand-written queries with literal column names.

import "server-only";
import postgres from "postgres";
import { newId } from "@/lib/id";

let sqlClient: ReturnType<typeof postgres> | null = null;

function getSql() {
  if (!sqlClient) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not configured on the server. Add it to .env.local " +
          "(the pooled connection string from the Vercel Marketplace Neon " +
          "integration's Quickstart panel), or to your deployment's " +
          "environment variables for production."
      );
    }
    sqlClient = postgres(connectionString, { ssl: "require" });
  }
  return sqlClient;
}

let schemaReady: Promise<void> | null = null;

export function ensureAuthSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = runMigrations().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

async function runMigrations(): Promise<void> {
  const sql = getSql();
  await sql`
    create table if not exists users (
      "id" text primary key,
      "email" text not null unique,
      "passwordHash" text not null,
      "failedLoginAttempts" integer not null default 0,
      "lockedUntil" timestamptz,
      "createdAt" timestamptz not null,
      "updatedAt" timestamptz not null
    )
  `;
}

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createUser(email: string, passwordHash: string): Promise<UserRow> {
  const sql = getSql();
  const now = new Date().toISOString();
  const [row] = await sql<UserRow[]>`
    insert into users ("id", "email", "passwordHash", "createdAt", "updatedAt")
    values (${newId()}, ${normalizeEmail(email)}, ${passwordHash}, ${now}, ${now})
    returning *
  `;
  return row;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const sql = getSql();
  const rows = await sql<UserRow[]>`
    select * from users where "email" = ${normalizeEmail(email)} limit 1
  `;
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const sql = getSql();
  const rows = await sql<UserRow[]>`select * from users where "id" = ${id} limit 1`;
  return rows[0] ?? null;
}

export function isLockedOut(user: UserRow): boolean {
  return Boolean(user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now());
}

export async function recordFailedLogin(user: UserRow): Promise<void> {
  const sql = getSql();
  const attempts = user.failedLoginAttempts + 1;
  const lockedUntil =
    attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString() : user.lockedUntil;
  await sql`
    update users
    set "failedLoginAttempts" = ${attempts}, "lockedUntil" = ${lockedUntil}, "updatedAt" = ${new Date().toISOString()}
    where "id" = ${user.id}
  `;
}

export async function resetFailedLogins(userId: string): Promise<void> {
  const sql = getSql();
  await sql`
    update users
    set "failedLoginAttempts" = 0, "lockedUntil" = null, "updatedAt" = ${new Date().toISOString()}
    where "id" = ${userId}
  `;
}
