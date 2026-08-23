// WatchSession is append-only-ish: one row per play session, created on
// the first tracked tick and touched (endedAt/secondsWatched bumped) on
// every subsequent one. See ARCHITECTURE.md §1 and §4.3.

import { db, type WatchSession } from "./db";
import { newId } from "./id";

export async function createWatchSession(
  itemId: string,
  source: WatchSession["source"]
): Promise<string> {
  const now = new Date().toISOString();
  const session: WatchSession = {
    id: newId(),
    itemId,
    startedAt: now,
    endedAt: now,
    secondsWatched: 0,
    source,
  };
  await db.watchSessions.add(session);
  return session.id;
}

export async function touchWatchSession(sessionId: string, secondsWatched: number): Promise<void> {
  await db.watchSessions.update(sessionId, {
    endedAt: new Date().toISOString(),
    secondsWatched,
  });
}
