"use client";

import { useState } from "react";
import { createItemFromDiscoveredPdfBlob, createItemFromDiscoveredPdfLink } from "@/lib/items";
import type { PdfSearchResult } from "@/lib/archiveOrg";

type Message = { type: "success" | "error"; text: string } | null;

/**
 * Phase 4b's "Find PDF online" flow (ARCHITECTURE.md §5.2). Search hits
 * archive.org via app/api/pdf-search; picking a result creates a new pdf
 * Item, enforcing the storage rule exactly:
 * - licenseUrl present → "Add as link" or "☁ Save permanently" (the
 *   latter calls app/api/pdf-search/save, which fetches server-side and
 *   uploads to Vercel Blob — same pattern as the manual upload flow).
 * - licenseUrl absent → only "Add as link" is offered. The Blob upload
 *   route is never referenced anywhere in that code path.
 */
export default function PdfDiscovery({
  scriptureId,
  defaultQuery,
}: {
  scriptureId: string;
  defaultQuery: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(defaultQuery);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PdfSearchResult[] | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [busyIdentifier, setBusyIdentifier] = useState<string | null>(null);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setMessage(null);
    setResults(null);
    try {
      const res = await fetch(`/api/pdf-search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Search failed.");
      setResults(data.results as PdfSearchResult[]);
      if (data.results.length === 0) {
        setMessage({ type: "error", text: "No PDF results found for that search." });
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setLoading(false);
    }
  };

  const addAsLink = async (result: PdfSearchResult) => {
    setBusyIdentifier(result.identifier);
    setMessage(null);
    try {
      await createItemFromDiscoveredPdfLink({
        scriptureId,
        title: result.title,
        sourceUrl: result.sourceUrl,
        licenseUrl: result.licenseUrl,
      });
      setMessage({ type: "success", text: `Added "${result.title}" as a link.` });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusyIdentifier(null);
    }
  };

  const savePermanently = async (result: PdfSearchResult) => {
    if (!result.licenseUrl) return; // storage rule: never for an unlicensed pick
    setBusyIdentifier(result.identifier);
    setMessage(null);
    try {
      const res = await fetch("/api/pdf-search/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: result.sourceUrl,
          licenseUrl: result.licenseUrl,
          title: result.title,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Save failed.");
      await createItemFromDiscoveredPdfBlob({
        scriptureId,
        title: result.title,
        sourceUrl: result.sourceUrl,
        licenseUrl: result.licenseUrl,
        pathname: data.pathname,
      });
      setMessage({ type: "success", text: `Saved "${result.title}" permanently to the cloud.` });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusyIdentifier(null);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-md px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
      >
        🔎 Find PDF online
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-900/15 bg-white p-4 dark:border-amber-100/15 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Find PDF online (archive.org)
        </label>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          Close
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search title…"
          disabled={loading}
          className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950"
        />
        <button
          type="button"
          onClick={search}
          disabled={loading || !query.trim()}
          className="shrink-0 rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.type === "error" ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"}`}>
          {message.text}
        </p>
      )}

      {results && results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((result) => {
            const busy = busyIdentifier === result.identifier;
            return (
              <li
                key={result.identifier}
                className="flex flex-col gap-1.5 rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      {result.title}
                    </p>
                    {result.creator && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">{result.creator}</p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      result.licenseUrl
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                    }`}
                  >
                    {result.licenseUrl ? "Public domain" : "License unknown"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  <a
                    href={result.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-neutral-500 hover:underline dark:text-neutral-400"
                  >
                    View source ↗
                  </a>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => addAsLink(result)}
                    disabled={busy}
                    className="rounded-md border border-amber-700 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-400 dark:text-amber-400 dark:hover:bg-amber-950/30"
                  >
                    {busy ? "Adding…" : "Add as link"}
                  </button>
                  {result.licenseUrl && (
                    <button
                      type="button"
                      onClick={() => savePermanently(result)}
                      disabled={busy}
                      className="rounded-md bg-amber-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-50"
                    >
                      {busy ? "Saving…" : "☁ Save permanently"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
