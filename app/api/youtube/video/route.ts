import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/dal";
import {
  YoutubeApiError,
  extractVideoId,
  fetchVideoDetails,
  youtubeErrorStatus,
} from "@/lib/youtube";

export interface VideoImportResponse {
  videoId: string;
  title: string;
  thumbnailUrl?: string;
  durationSeconds: number;
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
    return NextResponse.json({ error: "Paste a YouTube video URL first." }, { status: 400 });
  }

  const videoId = extractVideoId(rawUrl);
  if (!videoId) {
    return NextResponse.json(
      { error: "Couldn't find a video ID in that. Paste a youtube.com/watch?v=... or youtu.be/... link." },
      { status: 400 }
    );
  }

  try {
    const details = await fetchVideoDetails([videoId]);
    const detail = details.get(videoId);

    if (!detail || detail.durationSeconds === null) {
      return NextResponse.json(
        { error: "Couldn't fetch that video — it may be private, deleted, or region-restricted. Add it manually instead." },
        { status: 404 }
      );
    }

    const responseBody: VideoImportResponse = {
      videoId,
      title: detail.title,
      thumbnailUrl: detail.thumbnailUrl,
      durationSeconds: detail.durationSeconds,
    };
    return NextResponse.json(responseBody);
  } catch (err) {
    if (err instanceof YoutubeApiError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: youtubeErrorStatus(err) });
    }
    console.error("YouTube video lookup failed:", err);
    return NextResponse.json(
      { error: "Something went wrong talking to YouTube. Try again in a moment." },
      { status: 502 }
    );
  }
}
