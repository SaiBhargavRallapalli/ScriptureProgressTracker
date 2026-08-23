"use client";

import { useState } from "react";
import { markPdfSavedToCloud } from "@/lib/items";
import type { Item } from "@/lib/db";

/**
 * The one explicit action that calls app/api/blob/upload. Only rendered
 * (see ItemRow) for a pdf Item that's currently local-only — never fired
 * automatically by the regular upload flow (Phase 1's ItemForm) or by
 * opening/caching a remote PDF (lib/items.ts's resolveAndCachePdfBlob,
 * which only ever writes to the *local* pdfBlob field).
 */
export default function SaveToCloudButton({ item }: { item: Item }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (item.type !== "pdf" || !item.pdfBlob || item.pdfStorage === "blob") {
    return null;
  }

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", item.pdfBlob!, `${item.title}.pdf`);
      const res = await fetch("/api/blob/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed.");
      await markPdfSavedToCloud(item.id, data.pathname);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={save}
        disabled={saving}
        title="Upload this PDF to Vercel Blob so it's backed up off this device too"
        className="text-xs text-amber-700 hover:underline disabled:opacity-50 dark:text-amber-400"
      >
        {saving ? "Saving to cloud…" : "☁ Save permanently"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
