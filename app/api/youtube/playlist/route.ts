import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/dal";
import {
  YoutubeApiError,
  extractPlaylistId,
  fetchPlaylistVideoIds,
  fetchVideoDetails,
  youtubeErrorStatus,
} from "@/lib/youtube";

export interface PlaylistImportItem {
  videoId: string;
  title: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  position: number;
}

export interface PlaylistImportResponse {
  items: PlaylistImportItem[];
  total: number;
  skipped: number;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const rawUrl = body.url?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "Paste a playlist URL or ID first." }, { status: 400 });
  }

  const playlistId = extractPlaylistId(rawUrl);
  if (!playlistId) {
    return NextResponse.json(
      {
        error:
          "Couldn't find a playlist ID in that. Paste a youtube.com/playlist?list=... link, a watch URL with &list=..., or a raw playlist ID.",
      },
      { status: 400 }
    );
  }

  try {
    const entries = await fetchPlaylistVideoIds(playlistId);

    if (entries.length === 0) {
      const empty: PlaylistImportResponse = { items: [], total: 0, skipped: 0 };
      return NextResponse.json(empty);
    }

    const details = await fetchVideoDetails(entries.map((entry) => entry.videoId));

    const items: PlaylistImportItem[] = [];
    let skipped = 0;

    for (const entry of entries) {
      const detail = details.get(entry.videoId);
      if (!detail || detail.durationSeconds === null) {
        // Private, deleted, or otherwise inaccessible — see
        // ARCHITECTURE.md §4.4. Not an error, just not importable.
        skipped++;
        continue;
      }
      items.push({
        videoId: entry.videoId,
        title: detail.title,
        thumbnailUrl: detail.thumbnailUrl,
        durationSeconds: detail.durationSeconds,
        position: entry.position,
      });
    }

    const responseBody: PlaylistImportResponse = { items, total: entries.length, skipped };
    return NextResponse.json(responseBody);
  } catch (err) {
    if (err instanceof YoutubeApiError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: youtubeErrorStatus(err) });
    }
    console.error("YouTube playlist import failed:", err);
    return NextResponse.json(
      { error: "Something went wrong talking to YouTube. Try again in a moment." },
      { status: 502 }
    );
  }
}
