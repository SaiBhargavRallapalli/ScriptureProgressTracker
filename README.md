# Scripture Tracker

A local-first, installable PWA for tracking scripture study and sadhana
habits. See `docs/ARCHITECTURE.md` for the full design and phased build
plan; this README covers what's built so far and how to run it.

## What's built (Phases 0-4)

**Phase 0 — offline app shell.** Next.js (App Router) + TypeScript +
Tailwind. `public/manifest.json` + a generated service worker
(`public/sw.js`, built by `scripts/build-sw.mjs` via `workbox-build` —
see that file for why Workbox directly rather than `next-pwa`) precache
the app shell so it installs and loads with zero network after the first
visit. `lib/db.ts` holds the Dexie (IndexedDB) schema.

**Phase 1 — manual CRUD, fully offline.** Create/edit/delete Scriptures
and Items (youtube_video, pdf, video_link) straight against Dexie via
`lib/scriptures.ts`/`lib/items.ts`, reactive via `dexie-react-hooks`. No
network calls anywhere in this phase.

**Phase 2 — YouTube playlist/video import.** `app/api/youtube/*/route.ts`
call the YouTube Data API v3 server-side (the API key never reaches the
browser) and batch requests to keep quota cost minimal (~4 units per 100
videos). Client bulk-inserts the results into Dexie.

**Phase 3 — in-app playback + watch tracking.** `components/YouTubePlayer.tsx`
+ `VideoPlayerModal.tsx` embed the YouTube IFrame Player API, track
watched seconds every 5 seconds, and auto-complete an item at the ENDED
event or the 90%-watched threshold — only for videos played inside this
app's own player (there's no way to detect viewing on youtube.com
itself). A "Mark complete" button on every Item covers everything else.

**Phase 4 — PDF handling.** `components/PdfViewer.tsx` renders PDFs with
`pdfjs-dist`, tracking `lastPageViewed` and completing at the last page
(or an optional user-set target page) — same completion-guard logic as
video tracking. `resolveAndCachePdfBlob` in `lib/items.ts` fetches a
remote PDF once and caches the bytes into Dexie, so every reopen after
that needs zero network. `app/api/blob/upload/route.ts` +
`app/api/blob/file/route.ts` handle the *opt-in* "☁ Save permanently to
cloud" action (Vercel Blob) — never called automatically by the regular
upload flow. Reading time is logged as a `WatchSession` (`source:
"reading"`) via the Page Visibility API, paused while the tab is hidden.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000, standard Next.js dev server
```

To test the actual installable/offline PWA behavior (the service worker
only gets generated on a production build), or to use the YouTube
import / cloud PDF save features (which need env vars — see
`docs/SETUP.md`):

```bash
npm run build
npm run start
```

## Deploying

See `docs/SETUP.md` for exact steps to deploy to Vercel's free Hobby
plan, required environment variables (`YOUTUBE_API_KEY`,
`BLOB_READ_WRITE_TOKEN`), and a checklist for verifying each phase's
acceptance criteria yourself.

## What's next

See `docs/ARCHITECTURE.md` §8 for the full phase list. Phase 4b
(automatic PDF discovery via archive.org/Wikisource) and Phase 5
(dashboard) are next.
