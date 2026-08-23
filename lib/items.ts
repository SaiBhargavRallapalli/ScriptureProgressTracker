// All reads/writes for the Item table. Positions are plain integers
// assigned in insertion order per scripture; moveItem() swaps two
// neighboring positions rather than renumbering the whole list.

import { useLiveQuery } from "dexie-react-hooks";
import { db, type Item } from "./db";
import { newId } from "./id";
import { createWatchSession } from "./watchSessions";

const COMPLETION_THRESHOLD = 0.9;

export type NewYoutubeVideoInput = {
  type: "youtube_video";
  scriptureId: string;
  title: string;
  sourceUrl: string;
};

export type NewVideoLinkInput = {
  type: "video_link";
  scriptureId: string;
  title: string;
  sourceUrl: string;
  durationMinutes?: number;
};

export type NewPdfInput = {
  type: "pdf";
  scriptureId: string;
  file: File;
  title?: string;
};

export type NewItemInput = NewYoutubeVideoInput | NewVideoLinkInput | NewPdfInput;

async function nextPosition(scriptureId: string): Promise<number> {
  const items = await db.items.where("scriptureId").equals(scriptureId).toArray();
  if (items.length === 0) return 0;
  return Math.max(...items.map((item) => item.position)) + 1;
}

export async function createItem(input: NewItemInput): Promise<Item> {
  const now = new Date().toISOString();
  const position = await nextPosition(input.scriptureId);
  const base = {
    id: newId(),
    scriptureId: input.scriptureId,
    position,
    status: "pending" as const,
    createdAt: now,
    updatedAt: now,
  };

  let item: Item;
  switch (input.type) {
    case "youtube_video": {
      const title = input.title.trim();
      const sourceUrl = input.sourceUrl.trim();
      if (!title) throw new Error("Title is required");
      if (!sourceUrl) throw new Error("A YouTube URL is required");
      item = { ...base, type: "youtube_video", title, sourceUrl };
      break;
    }
    case "video_link": {
      const title = input.title.trim();
      const sourceUrl = input.sourceUrl.trim();
      if (!title) throw new Error("Title is required");
      if (!sourceUrl) throw new Error("A URL is required");
      item = {
        ...base,
        type: "video_link",
        title,
        sourceUrl,
        ...(input.durationMinutes
          ? { durationSeconds: Math.round(input.durationMinutes * 60) }
          : {}),
      };
      break;
    }
    case "pdf": {
      if (!input.file) throw new Error("Choose a PDF file");
      const fallbackTitle = input.file.name.replace(/\.pdf$/i, "");
      const title = input.title?.trim() || fallbackTitle;
      item = {
        ...base,
        type: "pdf",
        title,
        // No cloud URL yet in Phase 1 — the file lives only in this
        // device's IndexedDB. `local:` just labels where it came from;
        // Phase 4's Vercel Blob upload will replace this with a real URL.
        sourceUrl: `local:${input.file.name}`,
        pdfBlob: input.file,
        pdfStorage: "local",
      };
      break;
    }
  }

  await db.items.add(item);
  return item;
}

export async function updateItem(
  id: string,
  patch: Partial<Omit<Item, "id" | "scriptureId" | "createdAt">>
): Promise<void> {
  await db.items.update(id, { ...patch, updatedAt: new Date().toISOString() });
}

// Setting status to "completed" stamps dateCompleted; moving it back off
// completed clears dateCompleted (Dexie deletes a key when you update it
// to `undefined`).
export async function setItemStatus(id: string, status: Item["status"]): Promise<void> {
  await db.items.update(id, {
    status,
    dateCompleted: status === "completed" ? new Date().toISOString() : undefined,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteItem(id: string): Promise<void> {
  await db.items.delete(id);
}

export async function moveItem(
  scriptureId: string,
  itemId: string,
  direction: "up" | "down"
): Promise<void> {
  await db.transaction("rw", db.items, async () => {
    const items = await db.items.where("scriptureId").equals(scriptureId).sortBy("position");
    const index = items.findIndex((item) => item.id === itemId);
    if (index === -1) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= items.length) return;

    const current = items[index];
    const neighbor = items[swapIndex];
    const now = new Date().toISOString();
    await db.items.update(current.id, { position: neighbor.position, updatedAt: now });
    await db.items.update(neighbor.id, { position: current.position, updatedAt: now });
  });
}

// --- YouTube import (Phase 2) --------------------------------------------
//
// The YouTube Data API calls themselves happen server-side in
// app/api/youtube/*/route.ts (the API key must never reach the browser).
// These two functions just take the already-fetched, normalized results
// and write them into Dexie — same nextPosition()/newId() machinery as
// createItem, so imported items never collide with existing positions.

export interface YoutubeVideoDetails {
  videoId: string;
  title: string;
  thumbnailUrl?: string;
  durationSeconds: number;
}

function youtubeVideoToItem(
  scriptureId: string,
  position: number,
  video: YoutubeVideoDetails,
  now: string
): Item {
  return {
    id: newId(),
    scriptureId,
    position,
    type: "youtube_video",
    title: video.title,
    sourceUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
    durationSeconds: video.durationSeconds,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    ...(video.thumbnailUrl ? { thumbnailUrl: video.thumbnailUrl } : {}),
  };
}

/** Bulk-inserts imported playlist videos, in the order given, after whatever items already exist. */
export async function createItemsFromYoutubePlaylist(
  scriptureId: string,
  videos: YoutubeVideoDetails[]
): Promise<Item[]> {
  if (videos.length === 0) return [];
  const now = new Date().toISOString();
  const base = await nextPosition(scriptureId);
  const items = videos.map((video, index) => youtubeVideoToItem(scriptureId, base + index, video, now));
  await db.items.bulkAdd(items);
  return items;
}

/** Same as above for a single pasted video URL. */
export async function createItemFromYoutubeVideo(
  scriptureId: string,
  video: YoutubeVideoDetails
): Promise<Item> {
  const now = new Date().toISOString();
  const position = await nextPosition(scriptureId);
  const item = youtubeVideoToItem(scriptureId, position, video, now);
  await db.items.add(item);
  return item;
}

// --- Watch tracking (Phase 3) --------------------------------------------
//
// Only ever reads the Item fresh from Dexie rather than trusting a
// possibly-stale object a caller might be holding — the in-app player's
// tick loop calls this every 5 seconds from a long-lived closure, so it
// can't rely on a prop staying current.

/**
 * Shared by every "did this item just get finished" check (video %,
 * reading page, manual button): flips status to completed and stamps
 * dateCompleted only if it isn't already completed, so re-triggering
 * completion (replaying a video, re-opening a finished PDF, clicking
 * "mark complete" twice) never resets the original completion date.
 */
function completionPatch(item: Item, reached: boolean): Partial<Item> {
  if (reached && item.status !== "completed") {
    return { status: "completed", dateCompleted: new Date().toISOString() };
  }
  return {};
}

/**
 * Called on every tracking tick (playing, paused, ended, visibility-hidden,
 * unmount-flush). `watchedSeconds` only ever moves Item.watchedSeconds
 * *up* — a rewind during playback never erases earlier progress. Crossing
 * the 90% threshold marks the item completed via completionPatch().
 */
export async function recordWatchProgress(
  itemId: string,
  watchedSeconds: number,
  durationSeconds?: number
): Promise<void> {
  const item = await db.items.get(itemId);
  if (!item) return;

  const patch: Partial<Item> = {};

  if (watchedSeconds > (item.watchedSeconds ?? 0)) {
    patch.watchedSeconds = watchedSeconds;
  }

  const effectiveDuration = durationSeconds || item.durationSeconds;
  const reached = !!effectiveDuration && watchedSeconds / effectiveDuration >= COMPLETION_THRESHOLD;
  Object.assign(patch, completionPatch(item, reached));

  if (Object.keys(patch).length === 0) return;
  await db.items.update(itemId, { ...patch, updatedAt: new Date().toISOString() });
}

/**
 * Phase 4 equivalent of recordWatchProgress, for PDFs. lastPageViewed
 * always reflects wherever the user last was (so reopening resumes
 * there, even if that's earlier than the furthest page they've reached).
 * Completion triggers when the current page reaches the item's
 * targetPageCount if set, otherwise the PDF's actual last page — via the
 * same completionPatch() guard used for videos.
 */
export async function recordReadingProgress(
  itemId: string,
  pageViewed: number,
  totalPages: number
): Promise<void> {
  const item = await db.items.get(itemId);
  if (!item) return;

  const target = item.targetPageCount || totalPages;
  const reached = pageViewed >= target;

  const patch: Partial<Item> = {
    lastPageViewed: pageViewed,
    ...completionPatch(item, reached),
  };

  await db.items.update(itemId, { ...patch, updatedAt: new Date().toISOString() });
}

export async function setTargetPageCount(itemId: string, targetPageCount: number | undefined): Promise<void> {
  await db.items.update(itemId, {
    targetPageCount: targetPageCount && targetPageCount > 0 ? targetPageCount : undefined,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * The plain "mark as complete" action, available on every Item regardless
 * of type — for pdf/video_link (tracking doesn't apply) or a youtube_video
 * watched outside the in-app player (§0.2: there's no way to detect that
 * automatically). Always logs a manual WatchSession so there's a record
 * the action happened, but — same rule as recordWatchProgress — only
 * (re)stamps status/dateCompleted if the item wasn't already completed.
 */
export async function markItemCompleteManually(itemId: string): Promise<void> {
  const item = await db.items.get(itemId);
  if (!item) return;

  await createWatchSession(itemId, "manual");

  const patch = completionPatch(item, true);
  if (Object.keys(patch).length > 0) {
    await db.items.update(itemId, { ...patch, updatedAt: new Date().toISOString() });
  }
}

// --- PDF handling (Phase 4) -----------------------------------------------

/**
 * Returns the PDF's bytes as a Blob, resolving from whichever source the
 * Item actually has (ARCHITECTURE.md §5.1): if pdfBlob is already stored
 * locally, use it directly with zero network. Otherwise fetch sourceUrl
 * once and cache the result into pdfBlob so every subsequent open needs
 * zero network too, regardless of whether the URL is a Vercel Blob URL
 * (Phase 4) or, eventually, an external link (Phase 4b).
 */
export async function resolveAndCachePdfBlob(item: Item): Promise<Blob> {
  if (item.pdfBlob) return item.pdfBlob;

  if (!item.sourceUrl || item.sourceUrl.startsWith("local:")) {
    throw new Error("No PDF is available for this item yet.");
  }

  const res = await fetch(item.sourceUrl);
  if (!res.ok) {
    throw new Error(`Couldn't download the PDF (HTTP ${res.status}).`);
  }
  const blob = await res.blob();

  await db.items.update(item.id, { pdfBlob: blob, updatedAt: new Date().toISOString() });

  return blob;
}

/**
 * Records the result of a successful upload to app/api/blob/upload — that
 * route call itself (and the explicit-action gating around it) lives in
 * SaveToCloudButton, since it's a network call to our own API, not a
 * Dexie write. This just persists the result.
 *
 * sourceUrl is set to our own /api/blob/file proxy, not the blob's real
 * (private) URL — the store is private, so the real URL 403s on a plain
 * fetch. Pointing at our own route means resolveAndCachePdfBlob's
 * ordinary `fetch(item.sourceUrl)` keeps working unmodified: it just
 * happens to hit our server, which holds the token.
 */
export async function markPdfSavedToCloud(itemId: string, pathname: string): Promise<void> {
  await db.items.update(itemId, {
    sourceUrl: `/api/blob/file?pathname=${encodeURIComponent(pathname)}`,
    pdfStorage: "blob",
    updatedAt: new Date().toISOString(),
  });
}

// --- Discovered PDFs (Phase 4b) -------------------------------------------
//
// Two creators, one per branch of ARCHITECTURE.md §5.2's storage rule.
// Both are only ever called from components/PdfDiscovery.tsx after the
// user picks a specific search result and an action for it.

export interface DiscoveredPdfInput {
  scriptureId: string;
  title: string;
  sourceUrl: string;
  licenseUrl?: string;
}

/**
 * "Add as link" — used for any discovered PDF the user doesn't save
 * permanently (always for unlicensed results; optionally for licensed
 * ones too). Never touches Blob storage. sourceUrl points at our own
 * /api/pdf-search/proxy route rather than the raw archive.org URL — a
 * same-origin stream-through with nothing persisted server-side, needed
 * because archive.org's download CDN doesn't send CORS headers, so a
 * direct browser fetch() of it fails. resolveAndCachePdfBlob (unchanged
 * from Phase 4) still only ever writes the bytes into this device's
 * IndexedDB, the first time the item is actually opened.
 */
export async function createItemFromDiscoveredPdfLink(input: DiscoveredPdfInput): Promise<Item> {
  const now = new Date().toISOString();
  const position = await nextPosition(input.scriptureId);
  const item: Item = {
    id: newId(),
    scriptureId: input.scriptureId,
    position,
    type: "pdf",
    title: input.title,
    sourceUrl: `/api/pdf-search/proxy?url=${encodeURIComponent(input.sourceUrl)}`,
    pdfStorage: "link",
    ...(input.licenseUrl ? { licenseUrl: input.licenseUrl } : {}),
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  await db.items.add(item);
  return item;
}

/**
 * "Save permanently" — only ever called after app/api/pdf-search/save
 * has already succeeded (that route itself re-checks licenseUrl is
 * present, so this can't be reached for an unlicensed pick even by a
 * bug in the calling UI). sourceUrl points at the private-Blob read
 * proxy, same pattern as markPdfSavedToCloud.
 */
export async function createItemFromDiscoveredPdfBlob(
  input: DiscoveredPdfInput & { pathname: string }
): Promise<Item> {
  const now = new Date().toISOString();
  const position = await nextPosition(input.scriptureId);
  const item: Item = {
    id: newId(),
    scriptureId: input.scriptureId,
    position,
    type: "pdf",
    title: input.title,
    sourceUrl: `/api/blob/file?pathname=${encodeURIComponent(input.pathname)}`,
    pdfStorage: "blob",
    ...(input.licenseUrl ? { licenseUrl: input.licenseUrl } : {}),
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  await db.items.add(item);
  return item;
}

export function useItems(scriptureId: string | undefined) {
  return useLiveQuery(
    () => (scriptureId ? db.items.where("scriptureId").equals(scriptureId).sortBy("position") : []),
    [scriptureId],
    []
  );
}
