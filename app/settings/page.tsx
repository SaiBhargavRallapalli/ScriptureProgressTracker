"use client";

import { useState } from "react";
import {
  runSync,
  setSyncToken,
  useLastSyncedAt,
  useSyncToken,
  useUnsyncedCount,
} from "@/lib/sync";

type Message = { type: "success" | "error"; text: string } | null;

function formatLastSynced(iso: string | undefined): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

export default function SettingsPage() {
  const savedToken = useSyncToken();
  const lastSyncedAt = useLastSyncedAt();
  const unsyncedCount = useUnsyncedCount();

  const [tokenInput, setTokenInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const saveToken = async () => {
    const value = tokenInput.trim();
    if (!value) return;
    setSaving(true);
    setMessage(null);
    try {
      await setSyncToken(value);
      setTokenInput("");
      setMessage({ type: "success", text: "Sync token saved on this device." });
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight text-amber-900 dark:text-amber-100">
        Settings
      </h1>

      <div className="flex flex-col gap-3 rounded-lg border border-amber-900/10 bg-white p-4 dark:border-amber-100/10 dark:bg-neutral-900">
        <div>
          <h2 className="font-medium text-amber-900 dark:text-amber-100">Cloud sync</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Optional cross-device backup (ARCHITECTURE.md §6). Nothing here is
            required to use the app — everything already works fully offline
            on this device. Paste the same sync token on every device you
            want kept in sync with each other.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Sync token
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveToken()}
              placeholder={savedToken ? "•••••••••••••••• (saved)" : "Paste your SYNC_TOKEN"}
              disabled={saving}
              className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950"
            />
            <button
              type="button"
              onClick={saveToken}
              disabled={saving || !tokenInput.trim()}
              className="shrink-0 rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            {savedToken
              ? "A token is saved on this device."
              : "No token saved yet — sync is off until you add one."}
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
            disabled={syncing || !savedToken}
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
    </div>
  );
}
