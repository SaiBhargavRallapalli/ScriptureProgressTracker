# Setup & deployment

## Environment variables (Phase 2+)

Phase 2 adds server-side YouTube Data API v3 calls, which need an API key.
Copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
```

```
YOUTUBE_API_KEY=your-key-here
```

Where to get one: Google Cloud Console → create/select a project → enable
"YouTube Data API v3" → Credentials → Create API key → restrict it to that
API. `.env.local` is gitignored — the key never gets committed.

For production, add the same variable in Vercel: **Project Settings →
Environment Variables → add `YOUTUBE_API_KEY`** (scope it to Production,
and Preview too if you want playlist import to work on preview deploys).
Redeploy after adding it — Vercel only picks up new env vars on the next
build. The key is read only in `app/api/youtube/*/route.ts` (server-side)
and never sent to the browser.

### Vercel Blob (Phase 4 — "save PDF permanently to cloud")

Add a second variable, `BLOB_READ_WRITE_TOKEN`:

```
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

1. Vercel dashboard → your project → **Storage** tab → **Create Database** → **Blob**.
2. Connect it to this project. Vercel's dashboard shows a "Quickstart"/env
   snippet with the exact `BLOB_READ_WRITE_TOKEN=...` line — copy that,
   not the store's hostname or store ID (those look similar but aren't
   the token).
3. **Access mode matters**: as of mid-2026 new Blob stores default to
   **private**. This app is built for that — uploads use
   `access: 'private'`, and reads go through
   `app/api/blob/file/route.ts`, which holds the token server-side and
   streams the bytes back (a private blob's real URL 403s on a plain
   client-side fetch, so `Item.sourceUrl` for a cloud-saved PDF points at
   `/api/blob/file?pathname=...`, i.e. our own route, not the blob's real
   URL). If your store is public instead, uploads still work but you'd
   want to simplify the code to use the direct blob URL — ask if you want
   that swapped.
4. For production, add the same `BLOB_READ_WRITE_TOKEN` in Vercel's
   Project Settings → Environment Variables, then redeploy.

One real constraint worth knowing: Vercel's Hobby-plan serverless
functions cap request bodies at ~4.5MB, so `app/api/blob/upload/route.ts`
rejects anything larger with a clear error before even trying. A scanned
commentary PDF can easily exceed that — those files just stay
local-only (`pdfStorage: 'local'`) unless/until we switch to the
client-direct-upload pattern (`@vercel/blob/client`'s `upload()` with a
signed-token route), which bypasses the function body limit entirely.
Worth doing if this turns out to matter in practice.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000. `npm run dev` does not generate the service
worker (Workbox's `generateSW` needs a finished production build to scan),
so the app runs but isn't installable/offline yet in dev mode — that's
normal. To test the actual PWA behavior locally, build and run the
production server instead:

```bash
npm run build   # runs `next build`, then scripts/build-sw.mjs
npm run start   # serves the production build on http://localhost:3000
```

## Deploying to Vercel's free Hobby plan

No `vercel.json` is needed — this is a standard Next.js App Router project
and Vercel auto-detects the build/output settings. `npm run build` (which
Vercel runs automatically) already produces `public/sw.js` as its last
step, so the service worker ships with every deploy.

1. **Create a Vercel account** at https://vercel.com/signup (free — no card
   required for the Hobby plan).
2. **Push this project to a Git repository** (GitHub, GitLab, or Bitbucket).
   Vercel deploys from a connected repo; you can also use the CLI (`vercel`)
   for a one-off deploy without Git, but connecting a repo gets you
   automatic redeploys on every push, which is worth it for a project
   you'll keep iterating on.
3. In the Vercel dashboard: **Add New → Project**, select the repo, and
   accept the auto-detected settings:
   - Framework Preset: **Next.js**
   - Build Command: `npm run build` (default — leave as-is)
   - Output Directory: (default — leave as-is)
   - Install Command: `npm install` (default)
4. Click **Deploy**. First deploy takes 1-2 minutes.
5. Once deployed, open the given `*.vercel.app` URL. Confirm:
   - The install icon appears in Chrome/Edge's address bar.
   - DevTools → Application → Manifest shows no errors.
   - DevTools → Application → Service Workers shows `sw.js` as activated.

### Alternative: deploy via CLI without connecting a Git repo

```bash
npm install -g vercel
vercel login
vercel        # first deploy, follow the prompts (link to a new project)
vercel --prod # promote to your production URL
```

### Staying on the free Hobby tier

Nothing in this project needs anything beyond Hobby: it's a fully static
app shell with no serverless functions, no database, and no third-party
API calls. Hobby's free-tier limits (function invocations, bandwidth) don't
come into play until later phases add API routes (Phase 2+) — see
`docs/ARCHITECTURE.md` §9 for the full breakdown of what stays free at each
phase.

## Verifying the acceptance criteria yourself

1. **Build succeeds**: `npm run build` should end with
   `Generated public/sw.js — precached N files`.
2. **Installable**: after `npm run build && npm run start` (or after
   deploying), visit the app in Chrome/Edge — an install icon appears in
   the address bar. Click it; the app opens in its own standalone window.
3. **Offline shell**: visit the app once while online, open DevTools →
   Network → check "Offline", then reload. The page should render from
   cache instead of showing the browser's offline error page. (DevTools →
   Application → Service Workers should show the worker as "activated and
   is running"; Application → Cache Storage should show `workbox-precache-*`,
   `pages`, and `assets` caches populated after that first online visit.)
4. **No unexpected network calls**: DevTools → Network tab on a fresh load
   should show only requests to your own origin (`_next/static/*`,
   `manifest.json`, icons, fonts) — nothing external.

## Verifying the Phase 2 (YouTube import) acceptance criteria

1. **Real playlist**: paste one of your own playlist URLs into a scripture's
   "Import from YouTube playlist" field. Confirm the imported item count
   matches what YouTube's own playlist page shows (minus any reported
   "skipped" count for private/deleted videos), and spot-check 2-3
   durations/titles/thumbnails against the actual video pages.
2. **Quota math**: Google Cloud Console → APIs & Services → YouTube Data
   API v3 → Quotas (or Metrics tab) — after one import, the quota consumed
   should be roughly `ceil(N/50)` units for `playlistItems.list` plus
   `ceil(N/50)` units for `videos.list`, e.g. ~4 units for a 100-video
   playlist (see `docs/ARCHITECTURE.md` §4.1). A much higher number means
   something is re-fetching per video instead of batching.
3. **Error handling**: paste an invalid string, a private playlist, or a
   playlist ID that doesn't exist — you should get a readable message
   inline on the page, not a crash or a raw 500.

## Phase 4b — automatic PDF discovery (archive.org)

No new environment variables — this reuses `BLOB_READ_WRITE_TOKEN` from
Phase 4 (only for the "Save permanently" action on a licensed result) and
calls archive.org's free, keyless search/metadata APIs directly.

One implementation note worth knowing: archive.org's download CDN
doesn't send `Access-Control-Allow-Origin`, so a browser can't `fetch()`
an archive.org PDF URL directly (confirmed against a real download URL).
Two routes work around this, both server-side to dodge the CORS problem
entirely:

- `app/api/pdf-search/save/route.ts` — for a **licensed** pick, fetches
  the PDF server-side and uploads it to Vercel Blob (same 4.5MB Hobby
  cap as the manual upload route).
- `app/api/pdf-search/proxy/route.ts` — for **any** "Add as link" pick
  (licensed or not), streams the PDF through our server without storing
  it anywhere. `Item.sourceUrl` for a "link" item points at this proxy
  route rather than the raw archive.org URL, so Phase 4's
  `resolveAndCachePdfBlob` can keep doing a plain same-origin `fetch()`
  unmodified — the bytes still only get cached into that device's
  IndexedDB the first time the item is opened, exactly as
  ARCHITECTURE.md §5.2 specifies. Both routes only ever fetch from
  `archive.org` hosts (checked in `lib/archiveOrg.ts`'s
  `assertArchiveOrgUrl`) so neither becomes an open URL-fetch proxy.

## Verifying the Phase 4 (PDF handling) acceptance criteria

1. **Manual upload renders correctly**: add a PDF to an Item (the regular
   file-picker flow from Phase 1), click "📖 Read", confirm it opens and
   pages render. This path never touches the network — the file went
   straight into Dexie.
2. **Offline reopen resumes**: read a few pages in, close the modal, then
   fully close/reopen the app (or just DevTools → Network → Offline →
   reload). Reopening that PDF should still work and resume near the
   page you left off ("Page X of Y" reflects `lastPageViewed`).
3. **Cloud save is opt-in only**: on a local-only PDF, confirm the "☁ Save
   permanently" button only appears next to that specific Item, and check
   Vercel's Blob store dashboard (or the Network tab) to confirm
   `/api/blob/upload` fires exactly once, only on that click — not on the
   original upload, not on later reopens.
4. **Cloud-saved PDF still opens offline after the first read**: after
   saving permanently, reopen the Item once while online (this fetches
   through `/api/blob/file` and caches the bytes into Dexie), then go
   offline and reopen again — should render with zero network calls the
   second time.

## Verifying the Phase 4b (PDF discovery) acceptance criteria

1. **Real search results**: on a scripture's page, click "🔎 Find PDF
   online", search "Bhagavad Gita", and confirm you get real archive.org
   results with a title and a "Public domain" or "License unknown" badge.
   Open a result's "View source ↗" link directly — it should download or
   preview a real PDF.
2. **Licensed pick, saved permanently**: pick a "Public domain" result
   and click "☁ Save permanently". Confirm it succeeds and the new Item
   shows "Saved to cloud" (same status line Phase 4 uses). Check the
   Network tab: `/api/pdf-search/save` fires once; `/api/blob/upload` is
   never called for this flow (it's a separate internal helper now, see
   `lib/blobServer.ts`).
3. **Unlicensed pick, link only**: pick a "License unknown" result and
   click "Add as link". Confirm no request to `/api/pdf-search/save` or
   `/api/blob/upload` happens — open DevTools → Network and verify. The
   new Item should show as not yet downloaded. Open it once (📖 Read) —
   this fetches through `/api/pdf-search/proxy` (not the raw archive.org
   URL — see the CORS note above) and caches the bytes into Dexie. Then
   go offline and reopen — should render with zero network calls.
