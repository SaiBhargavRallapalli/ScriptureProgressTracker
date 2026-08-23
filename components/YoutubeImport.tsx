"use client";

import { useState } from "react";
import { createItemFromYoutubeVideo, createItemsFromYoutubePlaylist } from "@/lib/items";
import type { PlaylistImportResponse } from "@/app/api/youtube/playlist/route";
import type { VideoImportResponse } from "@/app/api/youtube/video/route";

type Message = { type: "success" | "error"; text: string } | null;

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || "Request failed.");
  }
  return data as T;
}

export default function YoutubeImport({ scriptureId }: { scriptureId: string }) {
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistMessage, setPlaylistMessage] = useState<Message>(null);

  const [videoUrl, setVideoUrl] = useState("");
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoMessage, setVideoMessage] = useState<Message>(null);

  const importPlaylist = async () => {
    const url = playlistUrl.trim();
    if (!url) return;
    setPlaylistLoading(true);
    setPlaylistMessage(null);
    try {
      const { items, total, skipped } = await postJson<PlaylistImportResponse>(
        "/api/youtube/playlist",
        { url }
      );
      if (items.length > 0) {
        await createItemsFromYoutubePlaylist(scriptureId, items);
      }
      const parts = [`Imported ${items.length} of ${total} video${total === 1 ? "" : "s"}.`];
      if (skipped > 0) {
        parts.push(`${skipped} skipped (private, deleted, or unavailable).`);
      }
      setPlaylistMessage({ type: "success", text: parts.join(" ") });
      setPlaylistUrl("");
    } catch (err) {
      setPlaylistMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setPlaylistLoading(false);
    }
  };

  const importVideo = async () => {
    const url = videoUrl.trim();
    if (!url) return;
    setVideoLoading(true);
    setVideoMessage(null);
    try {
      const video = await postJson<VideoImportResponse>("/api/youtube/video", { url });
      await createItemFromYoutubeVideo(scriptureId, video);
      setVideoMessage({ type: "success", text: `Added "${video.title}".` });
      setVideoUrl("");
    } catch (err) {
      setVideoMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setVideoLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-amber-900/15 bg-white p-4 dark:border-amber-100/15 dark:bg-neutral-900">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Import from YouTube playlist
        </label>
        <div className="flex gap-2">
          <input
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && importPlaylist()}
            placeholder="https://www.youtube.com/playlist?list=…"
            disabled={playlistLoading}
            className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button
            type="button"
            onClick={importPlaylist}
            disabled={playlistLoading || !playlistUrl.trim()}
            className="shrink-0 rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {playlistLoading ? "Importing…" : "Import"}
          </button>
        </div>
        {playlistLoading && (
          <p className="text-xs text-neutral-400">
            This can take a few seconds for a large playlist…
          </p>
        )}
        {playlistMessage && (
          <p
            className={`text-sm ${
              playlistMessage.type === "error"
                ? "text-red-600"
                : "text-emerald-700 dark:text-emerald-400"
            }`}
          >
            {playlistMessage.text}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1 border-t border-amber-900/10 pt-3 dark:border-amber-100/10">
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Add a single YouTube video
        </label>
        <div className="flex gap-2">
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && importVideo()}
            placeholder="https://www.youtube.com/watch?v=…"
            disabled={videoLoading}
            className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button
            type="button"
            onClick={importVideo}
            disabled={videoLoading || !videoUrl.trim()}
            className="shrink-0 rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {videoLoading ? "Adding…" : "Add"}
          </button>
        </div>
        {videoMessage && (
          <p
            className={`text-sm ${
              videoMessage.type === "error"
                ? "text-red-600"
                : "text-emerald-700 dark:text-emerald-400"
            }`}
          >
            {videoMessage.text}
          </p>
        )}
      </div>
    </div>
  );
}
