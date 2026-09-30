"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup, type AuthActionState } from "@/lib/auth/actions";

const initialState: AuthActionState = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-amber-900 dark:text-amber-100">
          Create an account
        </h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Requires an invite code from whoever runs this deployment.
        </p>
      </div>

      <form
        action={formAction}
        className="flex flex-col gap-3 rounded-lg border border-amber-900/10 bg-white p-4 dark:border-amber-100/10 dark:bg-neutral-900"
      >
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <p className="text-xs text-neutral-400 dark:text-neutral-500">At least 8 characters.</p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300" htmlFor="inviteCode">
            Invite code
          </label>
          <input
            id="inviteCode"
            name="inviteCode"
            type="text"
            required
            autoComplete="off"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-amber-800 hover:underline dark:text-amber-300">
          Sign in
        </Link>
      </p>
    </div>
  );
}
