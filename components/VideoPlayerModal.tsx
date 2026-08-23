"use client";

import { useEffect, useRef } from "react";
import Modal from "./Modal";
import YouTubePlayer from "./YouTubePlayer";
import { recordWatchProgress } from "@/lib/items";
import { createWatchSession, touchWatchSession } from "@/lib/watchSessions";
import { extractVideoIdFromWatchUrl } from "@/lib/youtubeClient";
import type { Item } from "@/lib/db";

const TICK_MS = 5000;

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Owns the actual tracking logic (§4.3): a 5s interval while PLAYING that
 * writes Item.watchedSeconds + upserts a WatchSession, cleared on
 * PAUSED/ENDED/unmount, plus an immediate flush on visibilitychange and
 * unmount so a closed tab doesn't lose the last few seconds — though the
 * 5s interval, not that flush, is the real safety net (a killed tab won't
 * always fire visibilitychange either).
 *
 * Reminder (§0.2): this only sees playback that happens inside this
 * player. There's no way to detect a video watched on youtube.com or the
 * YouTube app — that's what the separate "Mark complete" button is for.
 */
export default function VideoPlayerModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const videoId = extractVideoIdFromWatchUrl(item.sourceUrl);

  const playerRef = useRef<YT.Player | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestWatchedRef = useRef<number>(item.watchedSeconds ?? 0);
  const flushingRef = useRef(false);

  const clearTick = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // secondsOverride is used for the ENDED case: some players report
  // getCurrentTime() a hair short of getDuration() right at the end, and
  // §4.3 wants ENDED to unconditionally count as complete rather than
  // riding on that being >= 90% by coincidence.
  const persistTick = async (secondsOverride?: number) => {
    const player = playerRef.current;
    if (!player || flushingRef.current) return;
    flushingRef.current = true;
    try {
      let duration: number;
      let current: number;
      try {
        duration = player.getDuration() || item.durationSeconds || 0;
        current = secondsOverride ?? player.getCurrentTime();
      } catch {
        return; // player not fully ready yet — nothing to persist
      }

      latestWatchedRef.current = Math.max(latestWatchedRef.current, current);

      if (!sessionIdRef.current) {
        sessionIdRef.current = await createWatchSession(item.id, "in_app_player");
      }
      await touchWatchSession(sessionIdRef.current, latestWatchedRef.current);
      await recordWatchProgress(item.id, latestWatchedRef.current, duration);
    } finally {
      flushingRef.current = false;
    }
  };

  const startTick = () => {
    clearTick();
    intervalRef.current = setInterval(() => {
      void persistTick();
    }, TICK_MS);
  };

  // Flush on tab hide and on unmount. Explicitly NOT the only save path —
  // the 5-second interval already wrote everything up to the last tick;
  // this just shaves off the last few seconds when possible.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") void persistTick();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearTick();
      void persistTick();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!videoId) {
    return (
      <Modal onClose={onClose} title={item.title}>
        <p className="text-sm text-red-600">Couldn&apos;t determine a video ID for this item.</p>
      </Modal>
    );
  }

  const resumeAt = item.watchedSeconds ?? 0;

  return (
    <Modal onClose={onClose} title={item.title}>
      <YouTubePlayer
        videoId={videoId}
        onReady={(player) => {
          playerRef.current = player;
          if (resumeAt > 1) {
            try {
              player.seekTo(resumeAt, true);
            } catch {
              // not fatal — just starts from the beginning
            }
          }
        }}
        onStateChange={(event) => {
          const state = event.data;
          if (state === YT.PlayerState.PLAYING) {
            startTick();
          } else if (state === YT.PlayerState.PAUSED) {
            clearTick();
            void persistTick();
          } else if (state === YT.PlayerState.ENDED) {
            clearTick();
            const duration = playerRef.current?.getDuration() || item.durationSeconds || 0;
            void persistTick(duration);
          }
        }}
      />
      <div className="mt-2 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <span>Progress is tracked automatically while playing here (not on youtube.com).</span>
        {resumeAt > 1 && <span>Resuming near {formatTimestamp(resumeAt)}</span>}
      </div>
    </Modal>
  );
}
