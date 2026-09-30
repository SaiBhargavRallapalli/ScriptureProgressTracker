# Personal Scripture & Sadhana Tracker — Architecture Spec

A local-first, installable PWA for tracking scripture study (video/PDF-based), built from the
structure already present in `SCRIPTURES_tracker.xlsx` and informed by the DharmaTrack demo and
the ytplaylistlength.one playlist-duration pattern.

---

## 0. Corrected assumptions (read this first)

Three things in the original brief don't hold up as stated. Fixing them changes the design, so
they're addressed before anything else:

1. **"Vercel gives a free DB" is no longer accurate.** Vercel deprecated its own Postgres and KV
   products in December 2024. What you get today is a *marketplace integration* to Neon
   (Postgres) or Upstash (Redis) — free tier, but a third-party product billed through Vercel,
   not a Vercel-owned database. For this app's data volume (a personal log of scriptures and
   videos, realistically a few thousand rows) Neon's free 0.5 GB/project, 100 compute-hours/month
   tier is overkill in the good sense — you will not come close to the ceiling.

2. **"Mark as watched automatically" only works for video played inside your own embedded
   player.** The YouTube IFrame Player API exposes `getCurrentTime()`, `getDuration()`, and an
   `onStateChange` event you can poll — but only for a video embedded in *your* page. There is no
   API that tells you a user watched a video on youtube.com or the YouTube mobile app. If the
   habit is "watch on the YouTube app during a commute," this app cannot auto-detect that —
   completion would need a manual tap. Auto-tracking is real, but it requires the person to press
   play inside your app's player, not just paste a link and watch elsewhere.

3. **"Fully offline" and "YouTube videos" are in tension for the video-playback part.** You can
   cache the app shell, all your PDFs, all your notes, and all your progress data for offline use.
   You cannot cache YouTube's actual video stream for offline playback — that's blocked both
   technically (DRM/streaming protocol) and by YouTube's terms of service. So: offline works fully
   for reading/reviewing/marking progress; watching a *new* YouTube video still needs a connection.
   PDFs you've added, by contrast, can be fully offline from the moment they're uploaded.

Everything below is designed around these three corrections rather than around the literal
original phrasing.

---

## 1. Data model

Reverse-engineered from the six per-scripture sheets, the master "Scriptures Tracker" sheet, and
the "Dashboard" sheet in your xlsx. The spreadsheet duplicates its own aggregates (Completed/
Pending/Total/Percentage columns, plus a separate Month_Date table) — those are recomputed in the
UI instead of stored, so they can never drift out of sync with the underlying rows.

```
Scripture (a "header", e.g. "Aditya Hridayam")
├─ id, title, description
├─ sourceType: hint only — "youtube_playlist" | "manual" | "mixed"
├─ youtubePlaylistId (nullable — set if imported from a playlist)
├─ startDate, targetDate
└─ createdAt, updatedAt

Item (a row inside a Scripture — a video, a PDF, or a link)
├─ id, scriptureId (FK), position (int, for ordering)
├─ type: "youtube_video" | "pdf" | "video_link" (non-YouTube, e.g. direct mp4/Vimeo)
├─ title, thumbnailUrl
├─ sourceUrl (YouTube watch URL, Vercel Blob URL for PDFs, or arbitrary link)
├─ durationSeconds (from YouTube API, or user-entered for PDFs/links)
├─ status: "pending" | "in_progress" | "completed"
├─ dateCompleted, notes (maps to your "Notes"/"Key Takeaways" columns)
├─ watchedSeconds (max position reached — for resume + "% watched")
└─ createdAt, updatedAt

WatchSession (append-only log — not in your sheet, but needed for real time-spent data)
├─ id, itemId (FK)
├─ startedAt, endedAt, secondsWatched
└─ source: "in_app_player" | "manual" (manual = user just ticked it complete)
```

Everything your sheet computed with formulas — Completed/Pending/Total per scripture, completion
%, total hours, monthly "videos completed" breakdown — becomes a query over `Item` and
`WatchSession`, not a stored field. That's the one structural change from the spreadsheet worth
calling out: it removes an entire class of bugs where the aggregate and the detail rows disagree.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | You already run this for DevBench; route handlers double as your serverless backend on Vercel with no separate service to deploy. |
| Styling | Tailwind | Same reasoning — reuse what you already know. |
| Local data store | IndexedDB via **Dexie.js** | This is the actual source of truth. Reads/writes never touch the network. Dexie gives you schema versioning and queries without hand-rolling raw IndexedDB. |
| Offline shell | Service worker (Workbox or `next-pwa`) + Web App Manifest | Caches the app shell and static assets so the UI loads with zero connectivity. |
| Optional cloud sync | Neon Postgres (Vercel Marketplace, free tier) | Only used for cross-device backup — see §5. Not required to use the app at all. |
| File storage | Vercel Blob (free tier: 1 GB storage / 10 GB transfer per month) | For PDFs you upload. |
| YouTube metadata | YouTube Data API v3, called from a Next.js route handler (never the browser) | Keeps your API key off the client; see §4 for quota math. |
| In-app video playback | YouTube IFrame Player API | Only path to real auto-tracking (see §0.2). |
| PDF rendering | pdf.js | Standard, works offline once the PDF blob is cached. |
| Charts | Recharts | For the dashboard/monthly-progress view. |

**On auth (superseded by Phase 7 — kept for history):** this section originally argued against
building real accounts for what was assumed to stay a single-user tool, on the reasoning that a
full user/session system is unnecessary complexity for one person, and recommended a single shared
bearer token (checked in `proxy.ts`) instead. That assumption changed once a second person needed
their own isolated data on the same deployment — Phase 7 (§8) replaces the bearer token with real
signup/login. The design, once it became worth building:

- **Stateless JWT sessions, not a stored session table.** `lib/auth/session.ts` signs a JWT
  (`jose`, `SESSION_SECRET` env var) containing `{userId, email, expiresAt}` and stores it in an
  httpOnly, secure, `sameSite: "lax"` cookie. No session table means no per-device revocation
  before a token's own 30-day expiry — the only global kill switch is rotating `SESSION_SECRET`,
  which logs out every account at once. Accepted tradeoff: this app's actual threat model is
  self-hosted personal/small-group use, not a target for sophisticated session hijacking, and a
  DB-backed session table's added complexity wasn't judged worth it for that model.
- **Two enforcement layers, per the Next.js authentication guide's own explicit warning that
  middleware/Proxy should never be the sole authorization boundary:** `proxy.ts` does only an
  *optimistic* check (decrypt the cookie, redirect if absent/invalid) — cheap, no DB call, and it
  runs on every request including prefetches. The *real*, enforced check is
  `lib/auth/dal.ts`'s `requireSession()`/`requireApiSession()`, called from the authenticated route
  group's layout and from every `app/api/**/route.ts` handler individually (a Proxy matcher
  excluding a path also skips Server Actions on that path, so nothing can rely on Proxy alone).
- **Password hashing via `node:crypto`'s built-in `scrypt`**, not bcrypt/argon2 — those ship as
  native addons with prebuild-matching risk on whatever container ends up building/running this;
  Node already has a well-reviewed KDF built in.
- **Signup is invite-gated (`SIGNUP_CODE`), not open.** All accounts on one deployment share that
  deployment's YouTube API quota, Blob storage, and Postgres database — there's no per-user
  billing to make open signup self-limiting, so it's gated instead.
- **IndexedDB isolation happens at the database *name*, not a row column.** IndexedDB is scoped
  per browser profile, not per account, so two people using the same browser need more than a
  `userId` filter on shared rows — each account gets its own database
  (`scripture-tracker-<userId>`, `lib/db.ts`'s `openUserDb()`/`closeUserDb()`), opened on login and
  closed on logout. Postgres, by contrast, *is* one shared set of tables with a `userId` column
  added to each (`lib/syncDb.ts`), since sync's whole job is one server-side store serving many
  devices/accounts.
- Logging out does **not** erase the outgoing account's local IndexedDB data by default — it only
  stops the app opening it, so an unsynced offline edit is never at risk from an accidental/looping
  logout. Settings has an explicit, opt-in "log out and erase this device's local data" action for
  the shared-computer case, which is the exception, not the default.

---

## 3. Offline strategy — what works, what doesn't

| Action | Offline? |
|---|---|
| Open the app, browse all scriptures/items | Yes — served from cached shell + IndexedDB |
| Mark an item pending/in-progress/completed, add notes | Yes — written to IndexedDB immediately |
| Read a PDF you already added | Yes — once the blob has been fetched once, cache it in IndexedDB (as a Blob) or via the service worker's cache storage for offline reads |
| Resume a PDF at your last page | Yes — position stored locally |
| Watch a YouTube video for the first time | **No** — needs a live connection to stream |
| Resume a YouTube video you started earlier | No — same streaming constraint |
| Import a new YouTube playlist | No — needs the YouTube Data API |
| Sync to Neon for backup | No — queued locally, sent next time you're online |

Implementation: a simple outbox pattern. Every write goes to IndexedDB first and is also appended
to an `outbox` table. When the app detects `navigator.onLine` (plus an actual fetch success, since
`onLine` is unreliable), it flushes the outbox to the sync API in order. Background Sync API would
automate this on Chromium, but it doesn't exist on Safari/iOS, so build the "flush on regaining
connectivity + manual sync button" path as the real mechanism and treat Background Sync as a
nice-to-have enhancement layered on top, not the only path.

---

## 4. YouTube integration

### 4.1 Playlist import (mirrors ytplaylistlength.one's approach)

1. User pastes a playlist URL or plain playlist ID.
2. Server route calls `playlistItems.list` (part=snippet, 50 items/page, 1 quota unit per call)
   to get ordered video IDs.
3. Batch those IDs (up to 50 per call) into `videos.list` (part=snippet,contentDetails, 1 quota
   unit per call) to get title, thumbnail, and ISO-8601 duration (`PT1H2M3S` — parse to seconds).
4. Create one `Item` per video, `type: "youtube_video"`, in playlist order.

Quota cost for importing a 100-video playlist: 2 calls to `playlistItems.list` + 2 calls to
`videos.list` = **4 units**, against a 10,000-unit daily budget. You could import ~40 playlists of
that size in a single day before hitting the ceiling — this will never be your bottleneck. The
one call to avoid is `search.list` (100 units/call) — never needed here since you always have a
playlist ID or video ID directly, not a keyword search.

### 4.2 Adding a single video

Paste a `youtube.com/watch?v=...` link → one `videos.list` call → one `Item`.

### 4.3 Auto watch-tracking (in-app player only — see §0.2)

- Embed the IFrame Player API for each `youtube_video` item's "play" action, not a plain
  `<iframe>` — you need the JS API surface, not just the embed.
- On `onStateChange` firing `PLAYING`, start a local interval (every 5s) calling
  `getCurrentTime()`, updating `Item.watchedSeconds` and appending to `WatchSession`.
- On `ENDED`, or once `watchedSeconds / durationSeconds >= 0.9` (some intros/outros never get
  watched to the literal last frame), set `status: "completed"` and `dateCompleted: now()`.
- On pause/unload, flush the current session to IndexedDB so a closed tab doesn't lose progress.

### 4.4 What you can't get from the API

Duration, title, and thumbnail are reliable. Whether a specific video has live comments, is
region-restricted, or is a private/deleted video will occasionally return zero duration — handle
that as a normal "couldn't fetch, add manually" case rather than an error state.

---

## 5. PDF handling

### 5.1 Manual upload (Phase 4)

- Upload → Vercel Blob (server-side route signs the upload; browser never holds Blob credentials).
- On first successful fetch, also store the PDF bytes as a `Blob` in IndexedDB (via Dexie) so
  later reads work with zero network, and so the file survives if you're offline when you open it.

### 5.2 Automatic discovery — search and pick (Phase 4b)

Flow: you type or auto-derive a query from the item/scripture title → the app shows a short list
of candidate PDFs with title, source, and (where available) a license/public-domain flag → you
pick one → it's attached to that `Item` permanently.

**Where the search actually runs matters, because the "free search API" landscape has moved:**

- Google's Custom Search JSON API — the obvious first idea — is **closed to new customers as of
  2025 and shuts down entirely on 2027-01-01**. [Certain] Not usable for a new project regardless
  of budget.
- Brave's Search API free tier was withdrawn in late 2025. [Certain] Also not usable for free
  anymore.
- The general-web options that remain free are all *capped trial or low monthly quotas* aimed at
  developers, not guaranteed-forever free tiers (e.g. Tavily's free plan is quoted around
  1,000 credits/month, SerpApi around 250/month). [Likely — these free-tier numbers move often;
  confirm on the provider's site before building against one.] For a personal app that searches
  maybe a handful of times a month (once per new scripture you add), either would be plenty *if*
  it's still free when you check — but neither should be treated as a permanent guarantee.

**The better fit for this specific content type: search archive.org directly, not the general web.**
The Internet Archive's Advanced Search API and Metadata API
(`https://archive.org/advancedsearch.php`, `https://archive.org/metadata/{id}`) are free, require
no API key, and have no meaningful quota ceiling for personal use. [Certain] Scripture texts,
translations, and commentaries are exactly the kind of public-domain/openly-licensed material
archive.org specializes in hosting, so search results there skew toward things you can legally
keep a permanent copy of — and archive.org's metadata includes a `licenseurl` field you can surface
in the picker UI as a rough "safe to keep" signal. Use this as the primary, default-on source.
Wikisource's API (also free, no key) is a reasonable second source for the same reason. Treat a
general web-search fallback (Tavily/SerpApi, whichever still has a workable free tier when you
build this) as optional and off by default, only for the cases archive.org and Wikisource miss.

**Storage rule — this is the part that actually resolves the copyright question:**

- PDFs found via archive.org/Wikisource with a clear public-domain or open license → safe to save
  permanently to Vercel Blob, same as a manual upload.
- PDFs found via general web search, or with no clear license → **do not copy them to your own
  cloud storage.** Store the `sourceUrl` on the `Item` and cache the bytes only in the *device's*
  IndexedDB the first time you actually open it there — the same "fetch once, cache locally"
  pattern already used for offline PDFs elsewhere in this doc. That gets you offline reading on
  the device you opened it on, without you becoming the one hosting a copy of someone else's
  copyrighted PDF on a public server reachable by anyone with the link. This isn't legal advice —
  it's a practical default that keeps the app's risk profile close to "I personally saved a file
  for my own reading," which is a different thing from "I'm redistributing it."

### 5.3 Reading and progress

- Render with pdf.js; track `lastPageViewed` and treat "reached the last page" (or a manually-set
  target page count) as the completion signal, parallel to the video 90%-watched rule.
- Reading-time tracking: start a timer while the PDF tab is the visible, focused tab (Page
  Visibility API); pause the timer on blur/hidden. This won't catch someone reading on paper from
  a printout, but nothing digital can.

---

## 6. Sync architecture (optional — build this last)

Given you already floated "database or JSON, whichever is more convenient" — start with the
simpler one. IndexedDB plus a manual **export/import JSON** button gets you a working single-device
app with zero backend, zero ongoing cost, and nothing that can break. Add Neon sync only once you
actually use this on two devices and feel the pain of not having it — that's a Phase 6 feature,
not a Phase 0 one.

When you do add it:

- Neon schema mirrors the local Dexie schema (same three tables).
- Sync route: `POST /api/sync` takes the outbox batch, upserts by `id` with a `updatedAt`
  last-write-wins rule (fine for one person on two devices — real conflicts are rare and low-
  stakes here), returns anything newer on the server than the client's last-known state.
- Protect the route with the single bearer token from §2 — checked in middleware, not per-route.
- Neon's free tier scales compute to zero after 5 minutes idle, so expect a one-to-two-second
  cold start on the first sync after a while — irrelevant for a background sync call, worth
  knowing so you don't mistake it for a bug.

---

## 7. Installable app ("how DevBench does it")

For the record: DevBench's PWA/offline support was something flagged as a recommended
improvement during a past audit — worth double-checking whether it actually shipped before using
it as your reference implementation. Either way, the standard recipe is the same and is worth
building fresh here:

1. **`manifest.json`** — name, icons (192px/512px + maskable), `display: "standalone"`,
   `theme_color`, `start_url`.
2. **Service worker** — precache the app shell (JS/CSS/fonts) and runtime-cache PDFs/thumbnails
   as they're fetched.
3. **Install prompt** — listen for `beforeinstallprompt` on Chrome/Edge/Android, show your own
   "Install" button (the browser's default prompt is easy to miss). On desktop this gives a real
   windowed app with its own icon; on Android it behaves like a native app shortcut.
4. **iOS Safari caveat**: no `beforeinstallprompt` event exists. Installation is manual ("Share →
   Add to Home Screen"), and Safari has historically been more aggressive about evicting storage
   for web apps not opened in a while — worth testing your offline data survives a week of
   non-use on an iPhone before relying on it there.
5. **If a literal downloadable installer matters more than "Add to Home Screen"** — e.g. you want
   a `.dmg`/`.exe` or a Play Store APK rather than a browser-installed PWA — wrap the same Next.js
   app with **Tauri** (thin desktop binary, small footprint, uses the OS's system webview) or
   **Capacitor** (for an Android/iOS store build). Treat this as an optional Phase 7: the PWA
   install path above gets you 90% of "feels like an app" for a fraction of the effort.

---

## 8. Phased build plan

Matching the phase-numbered style from your ONDC connector work — small, shippable slices rather
than one big bang:

- **Phase 0 — Skeleton.** Next.js + Tailwind scaffold, manifest.json + minimal service worker,
  Dexie schema for `Scripture`/`Item`/`WatchSession`. No backend yet. Deployed to Vercel, already
  installable, already works offline — because there's nothing dynamic to break yet.
- **Phase 1 — Local CRUD.** Create/edit a Scripture (header), manually add Items of any type
  (paste a YouTube link, upload a PDF as a local Blob, paste an arbitrary link). Fully offline,
  fully usable, zero backend calls.
- **Phase 2 — YouTube playlist import.** One route handler wrapping `playlistItems.list` +
  `videos.list`. Paste a playlist link, get all items populated with title/thumbnail/duration.
- **Phase 3 — In-app player + auto watch-tracking.** IFrame Player API, the polling/session logic
  from §4.3, auto-completion.
- **Phase 4 — PDF viewer + reading progress.** pdf.js integration, Vercel Blob upload route,
  offline caching of fetched PDFs, page-position resume.
- **Phase 4b — Automatic PDF discovery.** archive.org/Wikisource search route, picker UI,
  license-aware storage rule from §5.2. Build after manual upload works, since it's the same
  attach-to-Item flow with a search step bolted on the front.
- **Phase 5 — Dashboard.** Recomputed aggregates (completion %, hours watched/read, monthly
  breakdown) as Recharts views — this replaces your spreadsheet's Dashboard tab.
- **Phase 6 — Cloud sync.** Neon schema, `/api/sync` route, outbox flush logic, bearer-token
  protection. Only build this once you're actually using two devices.
- **Phase 7 — Accounts (multi-user).** Real signup/login (`lib/auth/`), replacing Phase 6's shared
  bearer token with per-account sessions; a `userId` column on every synced table; a separate
  IndexedDB database per account. Only worth building once a second person actually needs their
  own isolated data on the same deployment (see §2's "On auth").
- **Phase 7b — Shlokam.org Gita import.** A static, deterministic list of the 18 Bhagavad Gita
  chapter URLs (`lib/shlokam.ts`), a same-origin fetch proxy (`app/api/text-search/proxy`), and a
  sandboxed in-app reader (`TextViewer.tsx`) — the same license-cautious storage rule as Phase 4b's
  archive.org PDFs, since shlokam.org publishes no license anywhere on the site.
- **Phase 8 (optional) — Native packaging.** Tauri desktop build and/or Capacitor mobile build, if
  "Add to Home Screen" isn't enough.

Phases 0–1 alone are a complete, usable, fully offline personal tracker with no backend
whatsoever — worth shipping and living with before adding anything from Phase 2 onward.

---

## 9. Staying at $0 — what to watch

Every piece of this stack has a real free tier at personal-use scale, but "free" here means
"free within a quota," not "free unconditionally" — worth checking against your actual usage
rather than assuming:

| Service | Free tier | What would push you past it |
|---|---|---|
| Vercel Hobby (hosting + functions) | 1M function invocations/mo, 100GB bandwidth/mo [Likely — confirm current numbers, these get revised] | Sharing the app publicly with real traffic — not a risk for personal use. Also: Hobby's terms prohibit commercial/revenue use, irrelevant here since this isn't monetized. |
| Neon Postgres (via Vercel Marketplace) | 0.5GB storage, 100 compute-hrs/mo | Your entire dataset is text rows for a personal tracker — you will not get near this. [Certain] |
| Vercel Blob | 1GB storage, 10GB transfer/mo | Only relevant for manually-uploaded and confirmed-public-domain PDFs (§5.2) — a few hundred typical scripture PDFs fits comfortably. |
| YouTube Data API v3 | 10,000 units/day | Personal playlist imports cost single-digit units each — see §4.1 math. [Certain] |
| archive.org search | No published quota for reasonable use [Certain] | Won't happen at personal scale. |
| General web-search fallback (if you add one) | Whatever the provider currently offers — verify before relying on it | The only piece of this stack genuinely at risk of changing terms or disappearing, per §5.2. Keep it optional and off by default for that reason. |

If you ever do hit a wall on any of these, it'll show up as an explicit quota-exceeded error, not a
surprise bill — none of these free tiers auto-upgrade to paid without you adding a card and
opting in.

---

## 10. Open questions worth deciding before Phase 2

- Do you want playlist re-sync (re-check a previously-imported playlist for new videos added
  later) as a manual "refresh" action, or automatic on a schedule? Automatic needs a cron —
  Vercel Cron on the Hobby plan is free but capped, worth confirming current limits before relying
  on it, since Vercel's free-tier terms have moved before.
- For non-YouTube video links (Vimeo, direct mp4), do you want the same in-app-player tracking, or
  is manual "mark complete" acceptable there? Vimeo has a comparable player SDK; a raw mp4 link
  can use the native HTML5 `<video>` element's `timeupdate` event the same way.