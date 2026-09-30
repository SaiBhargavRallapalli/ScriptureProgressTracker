"use client";

import { useEffect, useRef, useState } from "react";
import { resolveAndCacheTextContent } from "@/lib/items";
import { createWatchSession, touchWatchSession } from "@/lib/watchSessions";
import type { Item } from "@/lib/db";

const TICK_MS = 5000;

/**
 * Renders a fetched-once-then-cached shlokam.org page (Phase 7) — same
 * fetch-once-cache-forever and Page-Visibility reading-time shape as
 * PdfViewer, for HTML instead of PDF bytes. No "last page"/auto-completion
 * signal exists for a single text page, same as video_link today — see
 * ItemRow's "Mark complete" button.
 */
export default function TextViewer({ item }: { item: Item }) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accumulatedRef = useRef(0);
  const visibleSinceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const content = await resolveAndCacheTextContent(item);
        if (!cancelled) setHtml(content);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't open this page.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const flushReadingTime = async () => {
    if (visibleSinceRef.current !== null) {
      const now = Date.now();
      accumulatedRef.current += (now - visibleSinceRef.current) / 1000;
      visibleSinceRef.current = now;
    }
    if (accumulatedRef.current < 1) return;

    if (!sessionIdRef.current) {
      sessionIdRef.current = await createWatchSession(item.id, "reading");
    }
    await touchWatchSession(sessionIdRef.current, Math.round(accumulatedRef.current));
  };

  useEffect(() => {
    if (!html) return; // nothing to time until content actually renders

    const startClock = () => {
      visibleSinceRef.current = Date.now();
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => void flushReadingTime(), TICK_MS);
      }
    };
    const stopClock = () => {
      void flushReadingTime();
      visibleSinceRef.current = null;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    if (document.visibilityState === "visible") startClock();

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") stopClock();
      else startClock();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stopClock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, html]);

  if (loading) {
    return <p className="text-sm text-neutral-400">Opening…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Fully sandboxed (no allow-scripts, no allow-same-origin) — the
          server already strips <script>/<style> in
          app/api/text-search/proxy, this is defense in depth against
          third-party markup we don't otherwise control. */}
      <iframe
        title={item.title}
        srcDoc={html ?? ""}
        sandbox=""
        className="h-[70vh] w-full rounded-lg border border-neutral-200 bg-white dark:border-neutral-800"
      />
      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        Reading time is tracked while this tab is visible and focused, and pauses when it isn&apos;t.
        There&apos;s no single &ldquo;last page&rdquo; for a page like this — use &ldquo;Mark
        complete&rdquo; when you&apos;re done.
      </p>
    </div>
  );
}
