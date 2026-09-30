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

## Phase 5 — dashboard

No new environment variables or external services. `lib/stats.ts` reads
straight from Dexie (`scriptures`, `items`, `watchSessions`) — nothing
here is a stored aggregate, so there's no separate sync/backfill step;
the numbers are correct the moment the underlying rows are.

## Verifying the Phase 5 (dashboard) acceptance criteria

1. **Numbers match by hand**: create 2-3 scriptures with a handful of
   items each — mix of `pending`/`in_progress`/`completed` statuses, and
   for the completed ones, complete them in different calendar months
   (you can backdate by editing an item's `dateCompleted` via DevTools →
   Application → IndexedDB if you don't want to wait months between
   tests). On the dashboard, count by hand: each scripture's card should
   show exactly completed/pending/total and the matching percentage; the
   monthly bar chart should show a bar in each month you completed
   something in, with the right height; "Completed this month" should
   match the current month's bar.
2. **Hours watched vs. read stay separate**: play a YouTube video partway
   in-app and read a few pages of a PDF, then check the two summary
   cards — watched time should only reflect video playback, read time
   only PDF reading time, never combined into one number.
3. **Live update, no reload**: from a scripture's page, change an Item's
   status (e.g. mark something complete), then click "Dashboard" in the
   nav — the numbers should already reflect the change. If they don't,
   something's wrong with the `useLiveQuery` wiring in `lib/stats.ts`
   (it should need zero manual refetching, the same way the Scriptures
   list page's progress bars already update live).

## Phase 6 — cloud sync (optional, build this last)

Only worth setting up once you're actually using the app on two devices
— everything works fully offline on one device without it
(ARCHITECTURE.md §6). Requires **Neon Postgres**, via the Vercel
Marketplace:

- Vercel dashboard → your project → **Storage** tab → **Create
  Database** → **Neon** (Postgres).
- Connect it to this project. The dashboard's "Quickstart" panel shows
  several env var names (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
  `PGHOST`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, ...) — use the
  plain pooled `DATABASE_URL`, not the `*_UNPOOLED` or `PG*`/`POSTGRES_*`
  variants.
- Add it to `.env.local`:
  ```
  DATABASE_URL=postgres://...
  ```
- For production, add the same variable in Vercel's Project Settings
  → Environment Variables, then redeploy.
- No separate migration step — `lib/syncDb.ts`'s `ensureSchema()` runs
  `create table if not exists` for all three tables the first time
  `/api/sync` is called after a cold start.
- Neon's free tier scales compute to zero after 5 minutes idle, so
  the first sync after a while may take a second or two (cold start)
  — expected, not a bug.

Sync itself needs no separate token to set up (see Phase 7 below) —
being logged in is what authorizes `/api/sync`.

## Phase 7 — accounts (multi-user)

Real signup/login, replacing Phase 6's single shared bearer token. Two
new environment variables:

1. **`SESSION_SECRET`** — signs/verifies session cookies
   (`lib/auth/session.ts`). Generate your own:
   ```
   openssl rand -base64 32
   ```
   Add it to `.env.local` and to Vercel's production env vars. Rotating
   this logs every account out at once — sessions are stateless JWTs
   with no server-side revocation list, a deliberate tradeoff for this
   app's threat model (see `docs/ARCHITECTURE.md` §2).

2. **`SIGNUP_CODE`** — required on the signup form
   (`lib/auth/actions.ts`'s `signup()`). All accounts on one deployment
   share its YouTube API quota, Blob storage, and Postgres database with
   no per-user billing, so signup is gated rather than open to anyone
   who finds the URL. Generate your own:
   ```
   openssl rand -hex 16
   ```
   and share it only with people you want able to create an account.

3. **`LEGACY_ADMIN_EMAIL`** (optional, one-time use) — only needed if
   you're upgrading a deployment that already has data from before
   accounts existed. Set it to the email you're about to sign up with,
   sign up, then `POST /api/admin/claim-legacy-data` while logged in as
   that account — this assigns every pre-accounts ("ownerless") row to
   your new account. Safe to call more than once (a no-op after the
   first successful run). Unset the env var afterward.

Each account gets its own IndexedDB database on every device it logs
into (`scripture-tracker-<userId>`) — IndexedDB is scoped per browser
profile, not per account, so this is what keeps two people's local data
apart even on a shared computer. Logging out does not erase that data
(so an unsynced offline edit is never at risk from an accidental
logout); Settings has an explicit "Log out and erase this device's
local data" action for shared/public computers.

## Verifying the Phase 6 (cloud sync) acceptance criteria

1. **Change propagates between "devices"**: sign up/log in in one browser
   profile, make a change (e.g. add a scripture or mark an item
   complete), open Settings and click "Sync now". Log into the *same*
   account in a *different* browser profile (or an incognito window),
   click "Sync now" there — confirm the change appears.
2. **Conflicting edits resolve by `updatedAt`, no crash**: without
   syncing in between, edit the same Item differently on both profiles
   (e.g. different notes, or a different status), then sync profile A,
   then sync profile B, then sync profile A again. Whichever edit has
   the later `updatedAt` should be the one both profiles end up with —
   confirm neither sync call errors or crashes.
3. **Two accounts stay isolated**: sign up a second account and confirm
   it starts with zero scriptures/items — none of the first account's
   data is visible, and syncing the second account never returns rows
   belonging to the first.

## Verifying the Phase 7 (accounts) acceptance criteria

1. **Logged-out redirect**: with the app running locally, visiting
   `http://localhost:3000/` in a browser with no session cookie should
   redirect to `/login`. `curl -i http://localhost:3000/api/sync` (a
   plain `GET`, no cookie) should come back `401 Unauthorized`.
2. **Wrong invite code rejected**: on `/signup`, submitting with an
   incorrect invite code should show an inline error, not create an
   account.
3. **Lockout after repeated failures**: on `/login`, submit the wrong
   password 5 times for the same account — the 6th attempt (even with
   the *correct* password) should be rejected with a "too many failed
   attempts" message for about 15 minutes.
4. **Per-account isolation, end to end**: sign up two accounts, add a
   scripture to each, and confirm neither shows up for the other — in
   the UI, in DevTools → Application → IndexedDB (two differently-named
   `scripture-tracker-<userId>` databases), and in Postgres (`select
   "userId", count(*) from scriptures group by "userId"` shows separate
   rows per account).
