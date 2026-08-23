# Scripture Tracker

A local-first, installable PWA for tracking scripture study and sadhana
habits. See `docs/ARCHITECTURE.md` for the full design and phased build
plan; this README covers what's built so far and how to run it.

## What's built (Phases 0-6)

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

**Phase 4b — automatic PDF discovery.** "🔎 Find PDF online" on a
scripture's page searches archive.org (`lib/archiveOrg.ts` +
`app/api/pdf-search/route.ts`, no API key needed) and enforces
ARCHITECTURE.md §5.2's storage rule exactly: a confirmed public-domain/
openly-licensed result can be "☁ Save permanently" (fetched server-side
and uploaded to Blob, via `app/api/pdf-search/save/route.ts`); anything
else only gets "Add as link" — `pdfStorage: 'link'`, no Blob call ever.
Because archive.org's download CDN doesn't send CORS headers, a "link"
Item's `sourceUrl` points at `app/api/pdf-search/proxy/route.ts` (a
same-origin, nothing-persisted stream-through) instead of the raw
archive.org URL, so Phase 4's cache-on-first-open logic keeps working
unmodified.

**Phase 5 — dashboard.** `lib/stats.ts` computes every number shown —
per-scripture completed/pending/total/percentage, hours watched vs.
hours read (kept separate, summed from `WatchSession` grouped by the
owning Item's type), and a 12-month completions histogram — live off
the Item/WatchSession tables via `useLiveQuery`, with nothing stored as
a redundant aggregate (ARCHITECTURE.md §1). The home page (`app/page.tsx`)
renders it: a progress card per scripture, summary totals, and a
Recharts bar chart. Change an Item's status anywhere in the app and
these numbers update on their own, no refresh needed.

**Phase 6 — cloud sync (optional).** Every write to Scriptures/Items/
WatchSessions is mirrored into an `outbox` table automatically, via
Dexie hooks in `lib/db.ts` (not hand-wired into each mutator — a hook
fires for every write regardless of which function performed it).
`lib/sync.ts` pushes unsynced outbox rows to `app/api/sync/route.ts` in
batches and applies whatever changes come back into Dexie — both sides
upsert by `id` with a strict "only overwrite if the incoming `updatedAt`
is newer" rule (last-write-wins; ARCHITECTURE.md §6), and a delete is a
tombstone (`deletedAt` set), never a hard delete, so it can propagate to
other devices on their next pull. Postgres access is server-only
(`lib/syncDb.ts`, `postgres.js`, no ORM — three tables didn't need one);
`proxy.ts` (Next.js 16's renamed `middleware.ts`) rejects any
`/api/sync/*` request without the right bearer token. Sync runs on the
browser's `online` event (confirmed by the sync fetch actually
succeeding, not just `navigator.onLine`) and from a "Sync now" button on
the Settings page, which also shows when it last succeeded. None of this
is required to use the app — everything still works fully offline on a
single device with sync never configured.

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
`BLOB_READ_WRITE_TOKEN`, `DATABASE_URL`, `SYNC_TOKEN`), and a checklist
for verifying each phase's acceptance criteria yourself.

## What's next

See `docs/ARCHITECTURE.md` §8 for the full phase list — Phase 7
(optional native packaging) is all that's left.
