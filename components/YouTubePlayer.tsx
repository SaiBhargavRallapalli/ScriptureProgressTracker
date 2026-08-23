"use client";

import { useEffect, useRef } from "react";
import { loadYouTubeIframeApi } from "@/lib/youtubeIframeApi";

/**
 * Thin wrapper around the YouTube IFrame Player API. Loads the API script
 * globally (once, via loadYouTubeIframeApi — not per mount), creates a
 * player bound to an internal div, and forwards onReady/onStateChange to
 * the parent. Carries no tracking logic itself — that lives in
 * VideoPlayerModal, which is the thing that actually knows about Items
 * and Dexie.
 */
export default function YouTubePlayer({
  videoId,
  onReady,
  onStateChange,
}: {
  videoId: string;
  onReady?: (player: YT.Player) => void;
  onStateChange?: (event: YT.OnStateChangeEvent) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YT.Player | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeIframeApi().then((YTNamespace) => {
      if (cancelled || !containerRef.current) return;
      const player = new YTNamespace.Player(containerRef.current, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => {
            if (!cancelled) onReady?.(player);
          },
          onStateChange: (event) => {
            if (!cancelled) onStateChange?.(event);
          },
        },
      });
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // Intentionally only re-run when videoId changes. onReady/onStateChange
    // are read fresh from the closure captured at mount time; re-running
    // this effect on every parent render would tear down and recreate the
    // player for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
