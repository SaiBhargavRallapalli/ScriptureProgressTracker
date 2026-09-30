"use client";

import { useState } from "react";
import { runSync, useLastSyncedAt, useUnsyncedCount } from "@/lib/sync";
import { eraseActiveUserDb } from "@/lib/db";
import { logout } from "@/lib/auth/actions";

type Message = { type: "success" | "error"; text: string } | null;

function formatLastSynced(iso: string | undefined): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

export default function SettingsClient({ user }: { user: { email: string } }) {
  const lastSyncedAt = useLastSyncedAt();
  const unsyncedCount = useUnsyncedCount();

  const [syncing, setSyncing] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const syncNow = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await runSync();
      if (result.ok) {
        setMessage({
          type: "success",
          text: `Synced — pushed ${result.pushed}, pulled ${result.pulled}.`,
        });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } finally {
      setSyncing(false);
    }
  };

  const eraseLocalData = async () => {
    if (
      !window.confirm(
        "This deletes all Scriptures/Items/notes stored on THIS device. Anything already synced to the cloud is unaffected and will come back next time you log in and sync. Continue?"
      )
    ) {
      return;
    }
    setErasing(true);
    try {
      await eraseActiveUserDb();
      await logout();
    } finally {
      setErasing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight text-amber-900 dark:text-amber-100">
        Settings
      </h1>

      <div className="flex flex-col gap-3 rounded-lg border border-amber-900/10 bg-white p-4 dark:border-amber-100/10 dark:bg-neutral-900">
        <div>
          <h2 className="font-medium text-amber-900 dark:text-amber-100">Account</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Signed in as <span className="font-medium">{user.email}</span>.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-amber-900/10 bg-white p-4 dark:border-amber-100/10 dark:bg-neutral-900">
        <div>
          <h2 className="font-medium text-amber-900 dark:text-amber-100">Cloud sync</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Optional cross-device backup (ARCHITECTURE.md §6). Nothing here is
            required to use the app — everything already works fully offline
            on this device. Signing in on another device with the same
            account keeps them in sync automatically.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-amber-900/10 pt-3 dark:border-amber-100/10">
          <div className="text-sm">
            <p className="text-neutral-700 dark:text-neutral-300">
              Last synced: {formatLastSynced(lastSyncedAt)}
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              {unsyncedCount === undefined
                ? "…"
                : unsyncedCount === 0
                  ? "Nothing waiting to sync."
                  : `${unsyncedCount} change${unsyncedCount === 1 ? "" : "s"} waiting to sync.`}
            </p>
          </div>
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            className="shrink-0 rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>

        {message && (
          <p className={`text-sm ${message.type === "error" ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"}`}>
            {message.text}
          </p>
        )}

        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          Sync also runs automatically whenever this device regains a
          working connection — the button above is for triggering it on
          demand (e.g. right before switching devices).
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-red-900/10 bg-white p-4 dark:border-red-100/10 dark:bg-neutral-900">
        <div>
          <h2 className="font-medium text-red-800 dark:text-red-300">Shared device</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Logging out normally leaves this device&apos;s local data in
            place (so unsynced offline edits are never at risk). If this is
            a shared/public computer, erase it explicitly instead.
          </p>
        </div>
        <button
          type="button"
          onClick={eraseLocalData}
          disabled={erasing}
          className="self-start rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          {erasing ? "Erasing…" : "Log out and erase this device's local data"}
        </button>
      </div>
    </div>
  );
}
