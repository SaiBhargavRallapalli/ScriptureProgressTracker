// Generates public/sw.js after every `next build`.
//
// Why a hand-driven Workbox script instead of `next-pwa`: next-pwa hasn't
// been updated to track current Next.js releases and its App Router support
// has been unreliable on recent versions (this project is on Next 16). It
// also wraps webpack directly, which doesn't sit well with Next's Turbopack
// build path. workbox-build's generateSW() is maintained by the Workbox
// team, doesn't hook into the bundler at all — it just scans the finished
// build output — so it works the same regardless of which bundler Next used
// for the build.
//
// Strategy:
//  - Precache every content-hashed file under .next/static/** (JS/CSS, plus
//    Phase 4's pdf.js worker chunk which is a bundler-emitted .mjs asset,
//    not .js) and the PWA-specific files in public/ (manifest, icons).
//    These are safe to cache aggressively because their filenames change
//    whenever their content does.
//  - Runtime-cache page navigations with NetworkFirst, so once a route has
//    been visited online, reloading it offline serves the last-seen HTML
//    instead of the browser's offline error page.
//  - Runtime-cache other same-origin assets (images, fonts) with
//    StaleWhileRevalidate as a safety net.
//  - Inline the Workbox runtime into the generated file (inlineWorkboxRuntime)
//    so the service worker has zero external dependencies at runtime — it
//    never needs a network request to Google's CDN to function offline.

import { generateSW } from "workbox-build";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const buildIdPath = path.join(root, ".next", "BUILD_ID");
const buildId = existsSync(buildIdPath)
  ? readFileSync(buildIdPath, "utf8").trim()
  : String(Date.now());

const { count, size, warnings } = await generateSW({
  swDest: path.join(root, "public", "sw.js"),
  globDirectory: root,
  globPatterns: [".next/static/**/*"],
  globIgnores: ["**/*.map"],
  modifyURLPrefix: {
    ".next/static/": "/_next/static/",
  },
  additionalManifestEntries: [
    { url: "/manifest.json", revision: buildId },
    { url: "/icons/icon-192.png", revision: buildId },
    { url: "/icons/icon-512.png", revision: buildId },
    { url: "/icons/icon-maskable-512.png", revision: buildId },
    { url: "/favicon.ico", revision: buildId },
  ],
  navigateFallback: undefined,
  runtimeCaching: [
    {
      // HTML documents (page loads / reloads). Try the network first so
      // content stays fresh while online; fall back to the last cached
      // response for that exact URL when offline.
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "pages",
        networkTimeoutSeconds: 3,
        expiration: { maxEntries: 50 },
      },
    },
    {
      // Fonts, images, and anything else same-origin that isn't already
      // precached above.
      urlPattern: ({ url, request }) =>
        url.origin === self.location.origin &&
        ["image", "font", "style", "script"].includes(request.destination),
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "assets",
        expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
  ],
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  inlineWorkboxRuntime: true,
  mode: "production",
  sourcemap: false,
});

if (warnings.length > 0) {
  console.warn("[build-sw] Workbox warnings:", warnings);
}

console.log(
  `[build-sw] Generated public/sw.js — precached ${count} files (${(
    size / 1024
  ).toFixed(1)} KB).`
);
