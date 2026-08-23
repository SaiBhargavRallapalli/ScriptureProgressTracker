// All reads/writes for the Item table. Positions are plain integers
// assigned in insertion order per scripture; moveItem() swaps two
// neighboring positions rather than renumbering the whole list.

import { useLiveQuery } from "dexie-react-hooks";
import { db, type Item } from "./db";
import { newId } from "./id";

export type NewYoutubeVideoInput = {
  type: "youtube_video";
  scriptureId: string;
  title: string;
  sourceUrl: string;
};

export type NewVideoLinkInput = {
  type: "video_link";
  scriptureId: string;
  title: string;
  sourceUrl: string;
  durationMinutes?: number;
};

export type NewPdfInput = {
  type: "pdf";
  scriptureId: string;
  file: File;
  title?: string;
};

export type NewItemInput = NewYoutubeVideoInput | NewVideoLinkInput | NewPdfInput;

async function nextPosition(scriptureId: string): Promise<number> {
  const items = await db.items.where("scriptureId").equals(scriptureId).toArray();
  if (items.length === 0) return 0;
  return Math.max(...items.map((item) => item.position)) + 1;
}

export async function createItem(input: NewItemInput): Promise<Item> {
  const now = new Date().toISOString();
  const position = await nextPosition(input.scriptureId);
  const base = {
    id: newId(),
    scriptureId: input.scriptureId,
    position,
    status: "pending" as const,
    createdAt: now,
    updatedAt: now,
  };

  let item: Item;
  switch (input.type) {
    case "youtube_video": {
      const title = input.title.trim();
      const sourceUrl = input.sourceUrl.trim();
      if (!title) throw new Error("Title is required");
      if (!sourceUrl) throw new Error("A YouTube URL is required");
      item = { ...base, type: "youtube_video", title, sourceUrl };
      break;
    }
    case "video_link": {
      const title = input.title.trim();
      const sourceUrl = input.sourceUrl.trim();
      if (!title) throw new Error("Title is required");
      if (!sourceUrl) throw new Error("A URL is required");
      item = {
        ...base,
        type: "video_link",
        title,
        sourceUrl,
        ...(input.durationMinutes
          ? { durationSeconds: Math.round(input.durationMinutes * 60) }
          : {}),
      };
      break;
    }
    case "pdf": {
      if (!input.file) throw new Error("Choose a PDF file");
      const fallbackTitle = input.file.name.replace(/\.pdf$/i, "");
      const title = input.title?.trim() || fallbackTitle;
      item = {
        ...base,
        type: "pdf",
        title,
        // No cloud URL yet in Phase 1 — the file lives only in this
        // device's IndexedDB. `local:` just labels where it came from;
        // Phase 4's Vercel Blob upload will replace this with a real URL.
        sourceUrl: `local:${input.file.name}`,
        pdfBlob: input.file,
        pdfStorage: "local",
      };
      break;
    }
  }

  await db.items.add(item);
  return item;
}

export async function updateItem(
  id: string,
  patch: Partial<Omit<Item, "id" | "scriptureId" | "createdAt">>
): Promise<void> {
  await db.items.update(id, { ...patch, updatedAt: new Date().toISOString() });
}

// Setting status to "completed" stamps dateCompleted; moving it back off
// completed clears dateCompleted (Dexie deletes a key when you update it
// to `undefined`).
export async function setItemStatus(id: string, status: Item["status"]): Promise<void> {
  await db.items.update(id, {
    status,
    dateCompleted: status === "completed" ? new Date().toISOString() : undefined,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteItem(id: string): Promise<void> {
  await db.items.delete(id);
}

export async function moveItem(
  scriptureId: string,
  itemId: string,
  direction: "up" | "down"
): Promise<void> {
  await db.transaction("rw", db.items, async () => {
    const items = await db.items.where("scriptureId").equals(scriptureId).sortBy("position");
    const index = items.findIndex((item) => item.id === itemId);
    if (index === -1) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= items.length) return;

    const current = items[index];
    const neighbor = items[swapIndex];
    const now = new Date().toISOString();
    await db.items.update(current.id, { position: neighbor.position, updatedAt: now });
    await db.items.update(neighbor.id, { position: current.position, updatedAt: now });
  });
}

export function useItems(scriptureId: string | undefined) {
  return useLiveQuery(
    () => (scriptureId ? db.items.where("scriptureId").equals(scriptureId).sortBy("position") : []),
    [scriptureId],
    []
  );
}
