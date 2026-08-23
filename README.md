# Scripture Tracker

A local-first, installable PWA for tracking scripture study and sadhana
habits. See `docs/ARCHITECTURE.md` for the full design and phased build
plan; this README covers what's built so far and how to run it.

## Phase 0 — offline app shell (current)

What's here:

- Next.js (App Router) + TypeScript + Tailwind CSS scaffold.
- `public/manifest.json` — installable PWA manifest (name, icons,
  `display: "standalone"`, theme color). Icons at `public/icons/` are
  placeholders — swap them for real artwork whenever you're ready.
- A generated service worker (`public/sw.js`, produced at build time by
  `scripts/build-sw.mjs` via `workbox-build`) that precaches the app shell
  so the app loads with no network connection after the first visit. See
  the comment at the top of `scripts/build-sw.mjs` for why Workbox directly
  rather than `next-pwa`.
- `lib/db.ts` — the Dexie (IndexedDB) schema: `Scripture`, `Item`,
  `WatchSession`, and `OutboxEntry` (the last one unused until Phase 6, set
  up now to avoid a schema migration later).
- Three routes: `/scriptures` (empty list), `/scriptures/[id]` (detail
  placeholder), `/settings` (empty placeholder).

Nothing in this phase makes a network call other than loading the app
itself — no backend, no external API, no analytics.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000, standard Next.js dev server
```

To test the actual installable/offline PWA behavior (the service worker
only gets generated on a production build):

```bash
npm run build
npm run start
```

## Deploying

See `docs/SETUP.md` for exact steps to deploy to Vercel's free Hobby plan,
plus a checklist for verifying installability and offline behavior
yourself.

## What's next

See `docs/ARCHITECTURE.md` §8 for the full phase list. Phase 1 (local CRUD
for scriptures/items, fully offline, zero backend) is next.
