"use client";

import { useEffect, useRef, useState } from "react";
import { updateItem } from "@/lib/items";

/**
 * A notes textarea that only writes to Dexie on blur, and only if the
 * value actually changed. Local state is the source of truth while
 * typing, so re-renders triggered by unrelated useLiveQuery updates
 * elsewhere on the page never clobber a keystroke.
 */
export default function NotesField({
  itemId,
  initialNotes,
}: {
  itemId: string;
  initialNotes?: string;
}) {
  const [value, setValue] = useState(initialNotes ?? "");
  const savedValue = useRef(initialNotes ?? "");

  useEffect(() => {
    // Only re-sync if the saved value changed from *outside* this field's
    // own last save (e.g. a future bulk-edit feature) — not on every
    // render triggered elsewhere on the page.
    if ((initialNotes ?? "") !== savedValue.current) {
      savedValue.current = initialNotes ?? "";
      setValue(initialNotes ?? "");
    }
  }, [initialNotes]);

  const save = async () => {
    if (value === savedValue.current) return;
    savedValue.current = value;
    await updateItem(itemId, { notes: value || undefined });
  };

  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      rows={2}
      placeholder="Notes…"
      className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
    />
  );
}
