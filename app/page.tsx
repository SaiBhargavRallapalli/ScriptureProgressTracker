import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-amber-900 dark:text-amber-100">
          Scripture Tracker
        </h1>
        <p className="mt-2 max-w-prose text-neutral-600 dark:text-neutral-400">
          A local-first, installable tracker for scripture study and sadhana
          habits. Everything you do here is stored on this device — nothing
          is sent anywhere.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/scriptures"
          className="rounded-lg border border-amber-900/10 bg-white p-4 transition-colors hover:border-amber-700/40 dark:border-amber-100/10 dark:bg-neutral-900"
        >
          <h2 className="font-medium text-amber-900 dark:text-amber-100">
            Scriptures
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Browse and track your scripture study lists.
          </p>
        </Link>

        <Link
          href="/settings"
          className="rounded-lg border border-amber-900/10 bg-white p-4 transition-colors hover:border-amber-700/40 dark:border-amber-100/10 dark:bg-neutral-900"
        >
          <h2 className="font-medium text-amber-900 dark:text-amber-100">
            Settings
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            App preferences (coming soon).
          </p>
        </Link>
      </div>

      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        Phase 0 — offline app shell only. No accounts, no cloud sync, no
        network calls beyond loading the app itself.
      </p>
    </div>
  );
}
