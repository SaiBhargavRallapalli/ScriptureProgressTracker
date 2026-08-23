// Server-only YouTube Data API v3 helpers.
//
// IMPORTANT: this file reads process.env.YOUTUBE_API_KEY and must only ever
// be imported from server code (route handlers under app/api/**). Never
// import it from a client component ("use client") — that would bundle the
// key into client JS. Next.js already keeps server-only env vars (no
// NEXT_PUBLIC_ prefix) out of the client bundle, but keeping the import
// boundary clean is the belt-and-suspenders version of that guarantee.

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export class YoutubeApiError extends Error {
  status: number;
  reason?: string;

  constructor(message: string, status: number, reason?: string) {
    super(message);
    this.name = "YoutubeApiError";
    this.status = status;
    this.reason = reason;
  }
}

/** Maps a YoutubeApiError to the HTTP status the client response should carry. */
export function youtubeErrorStatus(err: YoutubeApiError): number {
  if (err.reason === "missing_api_key") return 500;
  if (err.reason === "quotaExceeded") return 429;
  if (err.status >= 400 && err.status < 500) return err.status;
  return 502;
}

function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new YoutubeApiError(
      "YOUTUBE_API_KEY is not configured on the server. Add it to .env.local for local dev, or to your Vercel project's environment variables for production.",
      500,
      "missing_api_key"
    );
  }
  return key;
}

interface YoutubeErrorBody {
  error?: {
    code?: number;
    message?: string;
    errors?: { reason?: string }[];
    status?: string;
  };
}

async function youtubeFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const apiKey = getApiKey();
  const url = new URL(`${YOUTUBE_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  const body = (await res.json().catch(() => null)) as (T & YoutubeErrorBody) | null;

  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status;
    const message = body?.error?.message ?? `YouTube API request failed (HTTP ${res.status}).`;
    throw new YoutubeApiError(message, res.status, reason);
  }

  return body as T;
}

// --- ID extraction ------------------------------------------------------

const RAW_VIDEO_ID_RE = /^[\w-]{11}$/;
// YouTube playlist IDs vary in length/prefix (PL/UU/OL/FL/RD/...) — accept
// any reasonably long URL-safe token that isn't a raw video ID.
const RAW_PLAYLIST_ID_RE = /^[\w-]{12,}$/;

function tryParseUrl(input: string): URL | null {
  try {
    return new URL(input.includes("://") ? input : `https://${input}`);
  } catch {
    return null;
  }
}

export function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Check the raw-ID shape *before* attempting URL parsing: a bare token
  // like "PLxyz..." has no dot or slash, but `new URL("https://" + input)`
  // happily accepts it as a single-label hostname, which would otherwise
  // swallow this branch and incorrectly fall through to "no list param".
  if (RAW_PLAYLIST_ID_RE.test(trimmed)) return trimmed;

  const url = tryParseUrl(trimmed);
  return url?.searchParams.get("list") ?? null;
}

export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (RAW_VIDEO_ID_RE.test(trimmed)) return trimmed;

  const url = tryParseUrl(trimmed);
  if (!url) return null;

  const v = url.searchParams.get("v");
  if (v) return v;

  if (url.hostname === "youtu.be") {
    const id = url.pathname.replace(/^\//, "");
    if (RAW_VIDEO_ID_RE.test(id)) return id;
  }

  const pathMatch = url.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/);
  if (pathMatch) return pathMatch[1];

  return null;
}

// --- ISO-8601 duration parsing -------------------------------------------

const DURATION_RE = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

export function parseIso8601Duration(iso: string): number {
  const match = DURATION_RE.exec(iso);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  );
}

// --- playlistItems.list (paged) ------------------------------------------

interface PlaylistItemsResponse {
  items?: { snippet?: { resourceId?: { videoId?: string } } }[];
  nextPageToken?: string;
}

export interface PlaylistEntry {
  videoId: string;
  position: number;
}

export async function fetchPlaylistVideoIds(playlistId: string): Promise<PlaylistEntry[]> {
  const entries: PlaylistEntry[] = [];
  let pageToken: string | undefined;
  let position = 0;

  do {
    const body = await youtubeFetch<PlaylistItemsResponse>("/playlistItems", {
      part: "snippet",
      playlistId,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    });

    for (const entry of body.items ?? []) {
      const videoId = entry.snippet?.resourceId?.videoId;
      if (videoId) {
        entries.push({ videoId, position: position++ });
      }
    }

    pageToken = body.nextPageToken;
  } while (pageToken);

  return entries;
}

// --- videos.list (batched, up to 50 ids per call) ------------------------

interface VideosListResponse {
  items?: {
    id: string;
    snippet?: {
      title?: string;
      thumbnails?: Record<string, { url?: string } | undefined>;
    };
    contentDetails?: { duration?: string };
  }[];
}

export interface VideoDetail {
  videoId: string;
  title: string;
  thumbnailUrl?: string;
  durationSeconds: number | null; // null = unavailable (private/deleted/live)
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function pickThumbnail(thumbnails?: Record<string, { url?: string } | undefined>): string | undefined {
  return thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url;
}

/** Batches video IDs into groups of 50 — the max `id` param size per call. */
export async function fetchVideoDetails(videoIds: string[]): Promise<Map<string, VideoDetail>> {
  const result = new Map<string, VideoDetail>();
  if (videoIds.length === 0) return result;

  for (const batch of chunk(videoIds, 50)) {
    const body = await youtubeFetch<VideosListResponse>("/videos", {
      part: "snippet,contentDetails",
      id: batch.join(","),
    });

    for (const entry of body.items ?? []) {
      const duration = entry.contentDetails?.duration;
      result.set(entry.id, {
        videoId: entry.id,
        title: entry.snippet?.title ?? "Untitled",
        thumbnailUrl: pickThumbnail(entry.snippet?.thumbnails),
        durationSeconds: duration ? parseIso8601Duration(duration) : null,
      });
    }
    // Video IDs that are private/deleted/otherwise inaccessible simply
    // don't appear in `items` at all — callers should treat any ID with
    // no entry in the returned Map as "unavailable", same as one with a
    // null durationSeconds.
  }

  return result;
}
