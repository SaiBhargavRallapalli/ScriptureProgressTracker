// Client-safe helper — deliberately separate from lib/youtube.ts, which
// is server-only (reads process.env.YOUTUBE_API_KEY) and must never be
// imported from a "use client" component.

/** Pulls the `v` param back out of the `https://www.youtube.com/watch?v=...` URLs we store on youtube_video Items. */
export function extractVideoIdFromWatchUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("v");
  } catch {
    return null;
  }
}
