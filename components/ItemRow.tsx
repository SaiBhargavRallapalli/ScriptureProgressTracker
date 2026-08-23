"use client";

import { useEffect, useMemo, useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import NotesField from "@/components/NotesField";
import VideoPlayerModal from "@/components/VideoPlayerModal";
import { deleteItem, markItemCompleteManually, moveItem, setItemStatus } from "@/lib/items";
import type { Item } from "@/lib/db";

const TYPE_BADGE: Record<Item["type"], string> = {
  youtube_video: "YouTube",
  pdf: "PDF",
  video_link: "Video link",
};

function formatDuration(seconds?: number) {
  if (!seconds) return null;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

function formatWatchedProgress(item: Item): string | null {
  if (!item.watchedSeconds || !item.durationSeconds) return null;
  const pct = Math.min(100, Math.round((item.watchedSeconds / item.durationSeconds) * 100));
  const minutes = Math.floor(item.watchedSeconds / 60);
  const seconds = Math.floor(item.watchedSeconds % 60);
  return `Watched ${minutes}:${String(seconds).padStart(2, "0")} (${pct}%)`;
}

function PdfOpenLink({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-amber-700 hover:underline dark:text-amber-400"
    >
      Open PDF ({Math.round(blob.size / 1024)} KB, stored on this device)
    </a>
  );
}

export default function ItemRow({
  item,
  canMoveUp,
  canMoveDown,
}: {
  item: Item;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-900/10 bg-white p-3 dark:border-amber-100/10 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-900/10 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-100/10 dark:text-amber-200">
              {TYPE_BADGE[item.type]}
            </span>
            <span className="font-medium text-neutral-800 dark:text-neutral-100">
              {item.title}
            </span>
            {item.type === "youtube_video" && (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="rounded-md bg-amber-700 px-2 py-0.5 text-xs font-medium text-white hover:bg-amber-800"
              >
                ▶ Play
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
            {formatDuration(item.durationSeconds) && (
              <span>{formatDuration(item.durationSeconds)}</span>
            )}
            {formatWatchedProgress(item) && <span>{formatWatchedProgress(item)}</span>}
            {item.dateCompleted && (
              <span>Completed {new Date(item.dateCompleted).toLocaleDateString()}</span>
            )}
            {item.type === "pdf" && item.pdfBlob ? (
              <PdfOpenLink blob={item.pdfBlob} />
            ) : item.sourceUrl && !item.sourceUrl.startsWith("local:") ? (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-700 hover:underline dark:text-amber-400"
              >
                Open link
              </a>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={() => moveItem(item.scriptureId, item.id, "up")}
            className="rounded-md px-1.5 py-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={() => moveItem(item.scriptureId, item.id, "down")}
            className="rounded-md px-1.5 py-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800"
            aria-label="Move down"
          >
            ↓
          </button>
          <select
            value={item.status}
            onChange={(e) => setItemStatus(item.id, e.target.value as Item["status"])}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
          <button
            type="button"
            disabled={item.status === "completed"}
            onClick={() => markItemCompleteManually(item.id)}
            title="Mark complete without in-app tracking — e.g. watched on youtube.com, or a PDF/link read elsewhere"
            className="rounded-md px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
          >
            {item.status === "completed" ? "✓ Completed" : "Mark complete"}
          </button>
          <ConfirmButton label="Delete" onConfirm={() => deleteItem(item.id)} />
        </div>
      </div>

      <NotesField itemId={item.id} initialNotes={item.notes} />

      {playing && item.type === "youtube_video" && (
        <VideoPlayerModal item={item} onClose={() => setPlaying(false)} />
      )}
    </div>
  );
}
