// Minimal ambient types for the YouTube IFrame Player API. This isn't a
// published npm types package we depend on — the API itself is just a
// global `window.YT` object injected by https://www.youtube.com/iframe_api,
// so we hand-declare the small slice of it this app actually uses.
// Reference: https://developers.google.com/youtube/iframe_api_reference

declare namespace YT {
  enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5,
  }

  interface PlayerEvent {
    target: Player;
  }

  interface OnStateChangeEvent extends PlayerEvent {
    data: PlayerState;
  }

  interface OnErrorEvent extends PlayerEvent {
    data: number;
  }

  interface PlayerOptions {
    videoId?: string;
    width?: string | number;
    height?: string | number;
    playerVars?: {
      rel?: 0 | 1;
      modestbranding?: 0 | 1;
      playsinline?: 0 | 1;
      [key: string]: unknown;
    };
    events?: {
      onReady?: (event: PlayerEvent) => void;
      onStateChange?: (event: OnStateChangeEvent) => void;
      onError?: (event: OnErrorEvent) => void;
    };
  }

  class Player {
    constructor(elementOrId: string | HTMLElement, options: PlayerOptions);
    getCurrentTime(): number;
    getDuration(): number;
    seekTo(seconds: number, allowSeekAhead?: boolean): void;
    playVideo(): void;
    pauseVideo(): void;
    getPlayerState(): PlayerState;
    destroy(): void;
  }
}

interface Window {
  YT?: typeof YT;
  onYouTubeIframeAPIReady?: () => void;
}
