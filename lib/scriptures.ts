// All reads/writes for the Scripture table go through here so the
// create/update/delete logic (and the cascade-delete rule) lives in one
// place instead of being duplicated across components.

import { useLiveQuery } from "dexie-react-hooks";
import { db, type Scripture } from "./db";
import { newId } from "./id";

export interface ScriptureInput {
  title: string;
  description?: string;
  startDate?: string;
  targetDate?: string;
}

export async function createScripture(input: ScriptureInput): Promise<Scripture> {
  const now = new Date().toISOString();
  const title = input.title.trim();
  if (!title) {
    throw new Error("Title is required");
  }

  const scripture: Scripture = {
    id: newId(),
    title,
    sourceType: "manual",
    createdAt: now,
    updatedAt: now,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.startDate ? { startDate: input.startDate } : {}),
    ...(input.targetDate ? { targetDate: input.targetDate } : {}),
  };

  await db.scriptures.add(scripture);
  return scripture;
}

export async function updateScripture(id: string, input: ScriptureInput): Promise<void> {
  const title = input.title.trim();
  if (!title) {
    throw new Error("Title is required");
  }

  await db.scriptures.update(id, {
    title,
    // Explicit `undefined` tells Dexie to delete the key rather than store
    // an empty string, so a cleared field doesn't linger as "".
    description: input.description?.trim() || undefined,
    startDate: input.startDate || undefined,
    targetDate: input.targetDate || undefined,
    updatedAt: new Date().toISOString(),
  });
}

// Deletes the Scripture and every Item that belongs to it, in one
// transaction, so a delete can never leave orphaned Items behind.
export async function deleteScripture(id: string): Promise<void> {
  await db.transaction("rw", db.scriptures, db.items, async () => {
    await db.items.where("scriptureId").equals(id).delete();
    await db.scriptures.delete(id);
  });
}

export function useScriptures() {
  return useLiveQuery(() => db.scriptures.orderBy("createdAt").reverse().toArray(), [], []);
}

// Returns `undefined` while the query is still loading, `null` once
// loaded if no such scripture exists, or the Scripture itself.
export function useScripture(id: string | undefined) {
  return useLiveQuery(async () => {
    if (!id) return null;
    const scripture = await db.scriptures.get(id);
    return scripture ?? null;
  }, [id]);
}

// Progress is always computed live from the Item rows — never stored — so
// it can't drift from the underlying data (see ARCHITECTURE.md §1).
export function useScriptureProgress(scriptureId: string) {
  return useLiveQuery(
    async () => {
      const items = await db.items.where("scriptureId").equals(scriptureId).toArray();
      const completed = items.filter((item) => item.status === "completed").length;
      return { completed, total: items.length };
    },
    [scriptureId],
    { completed: 0, total: 0 }
  );
}
