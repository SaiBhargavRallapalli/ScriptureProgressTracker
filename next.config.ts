import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The service worker (public/sw.js) is generated fresh on every build by
  // scripts/build-sw.mjs (workbox-build). Make sure browsers always check
  // for a new one instead of serving a stale cached copy of the script
  // itself — Workbox's own precache entries are still content-hashed and
  // cache correctly underneath this.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
