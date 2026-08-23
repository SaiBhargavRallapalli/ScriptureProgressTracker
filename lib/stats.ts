// Every number here is computed from the live Item/WatchSession rows,
// never stored as its own field (ARCHITECTURE.md §1 — that's the one
// structural change from the old spreadsheet worth preserving: the
// aggregate can never drift from the detail rows because there's no
// separate aggregate to drift).
//
// Split into plain, dependency-free functions that take already-loaded
// arrays (easy to unit test with plain fixtures, no Dexie/IndexedDB
// needed) plus a couple of `useLiveQuery` hooks that fetch the rows and
// call them. The dashboard page only ever talks to the hooks.

import { useLiveQuery } from "dexie-react-hooks";
import { db, type Item, type Scripture, type WatchSession } from "./db";

export interface ScriptureStats {
  scriptureId: string;
  title: string;
  completed: number;
  // "Pending" here means "not completed" — i.e. status "pending" or
  // "in_progress" both count, matching the old sheet's binary
  // Completed/Pending columns rather than adding a third bucket.
  pending: number;
  total: number;
  /** 0-100, rounded. 0 for an empty scripture (no items yet). */
  percentage: number;
}

export function computeScriptureStats(scripture: Scripture, items: Item[]): ScriptureStats {
  const total = items.length;
  const completed = items.filter((item) => item.status === "completed").length;
  return {
    scriptureId: scripture.id,
    title: scripture.title,
    completed,
    pending: total - completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/**
 * Total time logged, split by what the time was spent on — video items
 * (youtube_video, video_link) vs. pdf items — never conflated into one
 * number. Sums every WatchSession.secondsWatched for items of each
 * kind; a video_link item's sessions are always manual (0 seconds,
 * since it has no in-app player) so they don't inflate the total, they
 * just fall into the "watched" bucket rather than "read".
 */
export function computeTimeTotals(
  items: Item[],
  sessions: WatchSession[]
): { watchedSeconds: number; readSeconds: number } {
  const typeById = new Map(items.map((item) => [item.id, item.type]));
  let watchedSeconds = 0;
  let readSeconds = 0;
  for (const session of sessions) {
    const type = typeById.get(session.itemId);
    if (type === "pdf") {
      readSeconds += session.secondsWatched;
    } else if (type === "youtube_video" || type === "video_link") {
      watchedSeconds += session.secondsWatched;
    }
  }
  return { watchedSeconds, readSeconds };
}

export interface MonthlyCompletion {
  /** "YYYY-MM", sortable/comparable as a string. */
  month: string;
  /** Short display label, e.g. "Aug '26". */
  label: string;
  count: number;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", " '");
}

/**
 * Buckets completed Items by the calendar month of `dateCompleted`,
 * across the current month and the `monthsBack` months before it
 * (default 11, so 12 months total). Always returns exactly that many
 * buckets in chronological order, zero-filled — a bar chart shouldn't
 * have to guess whether a missing month means "0" or "not fetched yet".
 */
export function computeMonthlyCompletions(items: Item[], monthsBack = 11): MonthlyCompletion[] {
  const now = new Date();
  const buckets: MonthlyCompletion[] = [];
  for (let i = monthsBack; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ month: monthKey(d), label: monthLabel(d), count: 0 });
  }
  const byMonth = new Map(buckets.map((b) => [b.month, b]));

  for (const item of items) {
    if (item.status !== "completed" || !item.dateCompleted) continue;
    const bucket = byMonth.get(monthKey(new Date(item.dateCompleted)));
    if (bucket) bucket.count += 1;
  }

  return buckets;
}

export interface DashboardStats {
  scriptures: ScriptureStats[];
  watchedSeconds: number;
  readSeconds: number;
  monthly: MonthlyCompletion[];
  completedThisMonth: number;
}

/**
 * Everything the dashboard needs, in one live query. Reactive: change an
 * Item's status anywhere in the app and this recomputes on the next
 * render, no manual refresh/refetch required (that's the point of
 * useLiveQuery over Dexie — see ARCHITECTURE.md §1).
 */
export function useDashboardStats(): DashboardStats | undefined {
  return useLiveQuery(async () => {
    const [scriptures, items, sessions] = await Promise.all([
      db.scriptures.toArray(),
      db.items.toArray(),
      db.watchSessions.toArray(),
    ]);

    const itemsByScripture = new Map<string, Item[]>();
    for (const item of items) {
      const list = itemsByScripture.get(item.scriptureId);
      if (list) list.push(item);
      else itemsByScripture.set(item.scriptureId, [item]);
    }

    const scriptureStats = scriptures.map((scripture) =>
      computeScriptureStats(scripture, itemsByScripture.get(scripture.id) ?? [])
    );

    const { watchedSeconds, readSeconds } = computeTimeTotals(items, sessions);
    const monthly = computeMonthlyCompletions(items);
    const completedThisMonth = monthly[monthly.length - 1]?.count ?? 0;

    return {
      scriptures: scriptureStats,
      watchedSeconds,
      readSeconds,
      monthly,
      completedThisMonth,
    };
  }, []);
}
