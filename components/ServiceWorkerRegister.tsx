"use client";

import { useEffect } from "react";

/**
 * Registers the precaching service worker (public/sw.js, generated at build
 * time by scripts/build-sw.mjs via workbox-build). Kept as its own client
 * component so the root layout can stay a server component.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
