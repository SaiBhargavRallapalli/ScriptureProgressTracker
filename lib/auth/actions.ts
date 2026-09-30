"use server";

// Login/signup/logout Server Actions — the Next.js 16 docs' sanctioned
// pattern for auth forms (<form action={signup}> + useActionState).
// Every action re-derives its own result from scratch; none of them trust
// anything from the client beyond the raw form fields.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_DURATION_SECONDS,
  signSession,
} from "./session";
import { hashPassword, verifyPassword } from "./passwords";
import {
  createUser,
  ensureAuthSchema,
  findUserByEmail,
  isLockedOut,
  recordFailedLogin,
  resetFailedLogins,
} from "./authDb";

export interface AuthActionState {
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function startSession(userId: string, email: string): Promise<void> {
  const token = await signSession({ userId, email });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function signup(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const inviteCode = String(formData.get("inviteCode") ?? "");

  const expectedCode = process.env.SIGNUP_CODE;
  if (!expectedCode) {
    return { error: "Signup is not configured on the server (SIGNUP_CODE is unset)." };
  }
  if (inviteCode !== expectedCode) {
    return { error: "Invalid invite code." };
  }
  if (!EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  await ensureAuthSchema();

  const existing = await findUserByEmail(email);
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser(email, passwordHash);
  await startSession(user.id, user.email);
  redirect("/");
}

export async function login(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  await ensureAuthSchema();

  const user = await findUserByEmail(email);
  if (!user) {
    return { error: "Incorrect email or password." };
  }
  if (isLockedOut(user)) {
    return { error: "Too many failed attempts. Try again in a few minutes." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordFailedLogin(user);
    return { error: "Incorrect email or password." };
  }

  await resetFailedLogins(user.id);
  await startSession(user.id, user.email);
  redirect("/");
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
