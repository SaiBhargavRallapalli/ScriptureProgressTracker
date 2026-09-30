"use client";

import { useRef, useState, type FormEvent } from "react";
import { createItem } from "@/lib/items";
import type { Item } from "@/lib/db";

// text_link items are only ever created in bulk via GitaImport, not
// through this manual single-item form.
type ItemType = Exclude<Item["type"], "text_link">;

const TYPE_LABELS: Record<ItemType, string> = {
  youtube_video: "YouTube video",
  pdf: "PDF",
  video_link: "Video link (mp4/Vimeo/etc.)",
};

export default function ItemForm({
  scriptureId,
  onDone,
}: {
  scriptureId: string;
  onDone: () => void;
}) {
  const [type, setType] = useState<ItemType>("youtube_video");
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetFields = () => {
    setTitle("");
    setSourceUrl("");
    setDurationMinutes("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (type === "youtube_video") {
        await createItem({ type, scriptureId, title, sourceUrl });
      } else if (type === "video_link") {
        await createItem({
          type,
          scriptureId,
          title,
          sourceUrl,
          durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
        });
      } else {
        const file = fileInputRef.current?.files?.[0];
        if (!file) throw new Error("Choose a PDF file");
        await createItem({ type, scriptureId, file, title: title || undefined });
      }
      resetFields();
      setAddedCount((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-amber-900/15 bg-white p-4 dark:border-amber-100/15 dark:bg-neutral-900"
    >
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Type
        </label>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as ItemType);
            setError(null);
          }}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        >
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {type === "pdf" ? (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              PDF file <span className="text-red-600">*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Title (optional — defaults to the file name)
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Title <span className="text-red-600">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {type === "youtube_video" ? "YouTube URL" : "Video URL"}{" "}
              <span className="text-red-600">*</span>
            </label>
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder={
                type === "youtube_video"
                  ? "https://www.youtube.com/watch?v=…"
                  : "https://…"
              }
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
          </div>
          {type === "video_link" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Duration (minutes)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-32 rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
            </div>
          )}
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {addedCount > 0 && !error && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Added {addedCount} item{addedCount > 1 ? "s" : ""}. Keep adding, or close when done.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add item"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Done
        </button>
      </div>
    </form>
  );
}
