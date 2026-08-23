// Loads the YouTube IFrame Player API script exactly once per page,
// however many <YouTubePlayer> components mount. A module-level cached
// promise is the mechanism: the first caller injects the <script> tag and
// everyone (including that same first caller) awaits the same promise,
// which resolves once YouTube calls the global onYouTubeIframeAPIReady
// callback it requires.

let apiPromise: Promise<typeof YT> | null = null;

export function loadYouTubeIframeApi(): Promise<typeof YT> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The YouTube IFrame API only loads in the browser."));
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (apiPromise) {
    return apiPromise;
  }

  apiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });

  return apiPromise;
}
