// Data Access Layer — the *real* auth boundary. proxy.ts only does an
// optimistic cookie-presence/signature check (see its own comment); the
// Next.js authentication guide is explicit that the enforced check belongs
// here, called from every Server Component, Server Action, and Route
// Handler that touches user data. import "server-only" so this can never
// end up in a client bundle.

import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySession, type SessionPayload } from "./session";
import { findUserById } from "./authDb";

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySession(token);
});

/** For Server Components/layouts: redirects to /login if there's no session. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** For Route Handlers: returns null instead of redirecting — the caller
 * is responsible for returning a 401 JSON response. */
export async function requireApiSession(): Promise<SessionPayload | null> {
  return getSession();
}

export interface CurrentUserDto {
  id: string;
  email: string;
}

/** DTO only — never return the full DB row (it carries passwordHash). */
export const getCurrentUser = cache(async (): Promise<CurrentUserDto | null> => {
  const session = await getSession();
  if (!session) return null;
  const user = await findUserById(session.userId);
  if (!user) return null;
  return { id: user.id, email: user.email };
});
