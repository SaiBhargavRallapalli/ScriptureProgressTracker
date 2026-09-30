// Server-only helpers for shlokam.org (Phase 7 addition). Unlike
// lib/archiveOrg.ts, this isn't a live search — shlokam.org exposes no
// search API, and its browse-by-deity/tag hub pages are a tile grid with
// no stable markup we can safely scrape. The one part of the site that IS
// deterministic is the Bhagavad Gita: all 18 chapters live at
// /gita/gita-chapter-<N>-nav.htm, confirmed against the site's own
// chapters.htm index, so that's what this module imports as one static
// list rather than something fetched/parsed at request time.
//
// shlokam.org shows no copyright/license notice anywhere on the site
// (checked the homepage, the Gita hub, and the chapter index) — treated
// exactly like an unlicensed archive.org result (docs/ARCHITECTURE.md
// §5.2): never re-hosted on our own storage, only cached into the
// requesting device's own IndexedDB, and always fetched through our own
// same-origin proxy (app/api/text-search/proxy/route.ts) rather than
// linking the raw shlokam.org URL from Item.sourceUrl.

export interface GitaChapter {
  chapter: number;
  title: string;
  url: string;
}

// The traditional 18 chapter names (public-domain, centuries-old textual
// divisions used across virtually every edition/translation of the
// Gita) — used here purely as display titles, not reproduced verse text.
const GITA_CHAPTER_TITLES: string[] = [
  "Arjuna Vishada Yoga — The Yoga of Arjuna's Grief",
  "Sankhya Yoga — The Yoga of Knowledge",
  "Karma Yoga — The Yoga of Action",
  "Jnana-Karma-Sannyasa Yoga — The Yoga of Renunciation of Action in Knowledge",
  "Karma-Sannyasa Yoga — The Yoga of Renunciation",
  "Dhyana Yoga — The Yoga of Meditation",
  "Jnana-Vijnana Yoga — The Yoga of Knowledge and Wisdom",
  "Akshara-Brahma Yoga — The Yoga of the Imperishable Brahman",
  "Raja-Vidya Raja-Guhya Yoga — The Yoga of Royal Knowledge and Royal Secret",
  "Vibhuti Yoga — The Yoga of Divine Glories",
  "Vishvarupa-Darshana Yoga — The Yoga of the Cosmic Vision",
  "Bhakti Yoga — The Yoga of Devotion",
  "Kshetra-Kshetrajna Vibhaga Yoga — The Yoga of the Field and Its Knower",
  "Guna-Traya Vibhaga Yoga — The Yoga of the Division of the Three Gunas",
  "Purushottama Yoga — The Yoga of the Supreme Being",
  "Daivasura Sampad Vibhaga Yoga — The Yoga of Divine and Demonic Qualities",
  "Shraddha-Traya Vibhaga Yoga — The Yoga of the Threefold Faith",
  "Moksha-Sannyasa Yoga — The Yoga of Liberation and Renunciation",
];

export const GITA_CHAPTERS: GitaChapter[] = GITA_CHAPTER_TITLES.map((title, i) => {
  const chapter = i + 1;
  return {
    chapter,
    title: `Chapter ${chapter}: ${title}`,
    url: `https://shlokam.org/gita/gita-chapter-${chapter}-nav.htm`,
  };
});

/**
 * Validates that a URL actually points at shlokam.org before the server
 * fetches it on the caller's behalf — same pattern as
 * lib/archiveOrg.ts's assertArchiveOrgUrl, so this never becomes an open
 * "fetch any URL" proxy just because a client can supply one.
 */
export function assertShlokamUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.hostname !== "shlokam.org" && !url.hostname.endsWith(".shlokam.org")) {
    throw new Error("This route only fetches from shlokam.org.");
  }
  return url;
}
