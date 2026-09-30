"use client";

import { useState } from "react";
import { createItemsFromShlokamGita } from "@/lib/items";

type Message = { type: "success" | "error"; text: string } | null;

export default function GitaImport({ scriptureId }: { scriptureId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const importGita = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const items = await createItemsFromShlokamGita(scriptureId);
      setMessage({ type: "success", text: `Added all ${items.length} chapters.` });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-900/15 bg-white p-4 dark:border-amber-100/15 dark:bg-neutral-900">
      <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Import the Bhagavad Gita from shlokam.org
      </label>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Adds all 18 chapters as readable pages. shlokam.org publishes no explicit license, so each
        chapter is added as a link — pages are cached on this device the first time you open them,
        never copied to cloud storage.
      </p>
      <button
        type="button"
        onClick={importGita}
        disabled={loading}
        className="self-start rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
      >
        {loading ? "Importing…" : "Import Bhagavad Gita (18 chapters)"}
      </button>
      {message && (
        <p
          className={`text-sm ${
            message.type === "error" ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
