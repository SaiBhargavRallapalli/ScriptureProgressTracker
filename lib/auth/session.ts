// Stateless JWT session tokens (jose + an httpOnly cookie), following the
// Next.js 16 authentication guide's own recommended recipe
// (node_modules/next/dist/docs/01-app/02-guides/authentication.md) rather
// than an auth library — consistent with the rest of this codebase's
// hand-written-over-abstraction style (lib/syncDb.ts, lib/id.ts).
//
// Deliberately stateless: no session table in Postgres, so logout is just
// a cookie delete and there is no per-device revocation before a token's
// own expiry — the only global kill switch is rotating SESSION_SECRET,
// which logs out every account at once. Accepted tradeoff for this app's
// actual threat model (see docs/ARCHITECTURE.md §2).

import "server-only";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "session";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_DURATION_SECONDS = SESSION_DURATION_MS / 1000;

// proxy.ts re-signs the cookie once less than this much time remains, so
// an active user is never logged out mid-use — a cheap cookie-in/
// cookie-out refresh with no DB call.
export const SESSION_REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not configured on the server. Generate one with " +
        "`openssl rand -base64 32` and add it to .env.local (and your " +
        "deployment's environment variables for production)."
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email: string;
  /** Epoch ms — mirrors the JWT's own `exp` claim, kept as plain data so
   * proxy.ts can decide whether to refresh without re-deriving it. */
  expiresAt: number;
}

export async function signSession(payload: { userId: string; email: string }): Promise<string> {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  return new SignJWT({ userId: payload.userId, email: payload.email, expiresAt })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(getSecretKey());
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.expiresAt !== "number"
    ) {
      return null;
    }
    return { userId: payload.userId, email: payload.email, expiresAt: payload.expiresAt };
  } catch {
    // Expired, malformed, or signed with a since-rotated SESSION_SECRET —
    // all treated the same way: no session.
    return null;
  }
}
