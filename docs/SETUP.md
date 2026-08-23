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
