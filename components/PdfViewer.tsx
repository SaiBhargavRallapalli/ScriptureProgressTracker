"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdfjs } from "@/lib/pdf";
import { recordReadingProgress, resolveAndCachePdfBlob, setTargetPageCount } from "@/lib/items";
import { createWatchSession, touchWatchSession } from "@/lib/watchSessions";
import type { Item } from "@/lib/db";

const TICK_MS = 5000;

/**
 * Renders a PDF page-by-page with pdf.js, tracks lastPageViewed +
 * completion (ARCHITECTURE.md §5.3), and logs reading time as a
 * WatchSession while the tab is visible/focused (Page Visibility API —
 * paused on hidden, per §5.3's explicit instruction).
 */
export default function PdfViewer({ item }: { item: Item }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);

  const [pageNum, setPageNum] = useState(item.lastPageViewed || 1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetInput, setTargetInput] = useState(
    item.targetPageCount ? String(item.targetPageCount) : ""
  );

  // reading-timer state (Page Visibility API)
  const sessionIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accumulatedRef = useRef(0);
  const visibleSinceRef = useRef<number | null>(null);

  // --- load the document once (local blob, or fetch-once-then-cache remote) ---
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const blob = await resolveAndCachePdfBlob(item);
        const arrayBuffer = await blob.arrayBuffer();
        const pdfjsLib = await loadPdfjs();
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
        setPageNum((current) => Math.min(Math.max(current, 1), doc.numPages));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn't open this PDF.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      docRef.current?.destroy();
      docRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // --- render the current page whenever it (or the doc) changes ---
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || !numPages) return;
    let cancelled = false;

    (async () => {
      const page = await doc.getPage(pageNum);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1.3 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) return;
      await page.render({ canvasContext: context, viewport }).promise;
    })();

    return () => {
      cancelled = true;
    };
  }, [pageNum, numPages]);

  // --- persist lastPageViewed + check completion whenever the page changes ---
  useEffect(() => {
    if (!numPages) return;
    void recordReadingProgress(item.id, pageNum, numPages);
  }, [item.id, pageNum, numPages]);

  // --- reading-time tracking ---
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
  }, [item.id]);

  const saveTarget = async () => {
    const value = targetInput.trim() ? Number(targetInput.trim()) : undefined;
    await setTargetPageCount(item.id, value);
  };

  if (loading) {
    return <p className="text-sm text-neutral-400">Opening PDF…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center overflow-auto rounded-lg border border-neutral-200 bg-neutral-100 p-2 dark:border-neutral-800 dark:bg-neutral-950">
        <canvas ref={canvasRef} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pageNum <= 1}
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            className="rounded-md border border-neutral-300 px-2 py-1 disabled:opacity-40 dark:border-neutral-700"
          >
            ← Prev
          </button>
          <span className="text-neutral-600 dark:text-neutral-400">
            Page {pageNum} of {numPages}
          </span>
          <button
            type="button"
            disabled={!numPages || pageNum >= numPages}
            onClick={() => setPageNum((p) => Math.min(numPages ?? p, p + 1))}
            className="rounded-md border border-neutral-300 px-2 py-1 disabled:opacity-40 dark:border-neutral-700"
          >
            Next →
          </button>
        </div>

        <div className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
          <label htmlFor="target-page">Target page (optional):</label>
          <input
            id="target-page"
            type="number"
            min={1}
            max={numPages ?? undefined}
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
            onBlur={saveTarget}
            placeholder={numPages ? String(numPages) : ""}
            className="w-16 rounded-md border border-neutral-300 px-1.5 py-0.5 dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>
      </div>

      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        Reading time is tracked while this tab is visible and focused, and pauses when it isn&apos;t.
      </p>
    </div>
  );
}
