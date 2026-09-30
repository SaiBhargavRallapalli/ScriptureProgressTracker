"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ScriptureForm from "@/components/ScriptureForm";
import ConfirmButton from "@/components/ConfirmButton";
import GitaImport from "@/components/GitaImport";
import ItemForm from "@/components/ItemForm";
import ItemRow from "@/components/ItemRow";
import YoutubeImport from "@/components/YoutubeImport";
import PdfDiscovery from "@/components/PdfDiscovery";
import {
  deleteScripture,
  updateScripture,
  useScripture,
  useScriptureProgress,
} from "@/lib/scriptures";
import { useItems } from "@/lib/items";

export default function ScriptureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const scripture = useScripture(id);
  const items = useItems(id);
  const progress = useScriptureProgress(id);
  const [editing, setEditing] = useState(false);
  const [addingItem, setAddingItem] = useState(false);

  if (scripture === undefined) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  if (scripture === null) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-neutral-600 dark:text-neutral-400">
          This scripture no longer exists.
        </p>
        <Link href="/scriptures" className="text-sm text-amber-700 hover:underline dark:text-amber-400">
          ← Back to Scriptures
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/scriptures"
        className="text-sm text-amber-700 hover:underline dark:text-amber-400"
      >
        ← Back to Scriptures
      </Link>

      {editing ? (
        <ScriptureForm
          submitLabel="Save"
          initial={{
            title: scripture.title,
            description: scripture.description,
            startDate: scripture.startDate,
            targetDate: scripture.targetDate,
          }}
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await updateScripture(scripture.id, input);
            setEditing(false);
          }}
        />
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-amber-900 dark:text-amber-100">
              {scripture.title}
            </h1>
            {scripture.description && (
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {scripture.description}
              </p>
            )}
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {progress.completed}/{progress.total} items completed
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Edit
            </button>
            <ConfirmButton
              label="Delete"
              confirmLabel="Delete scripture & its items"
              onConfirm={async () => {
                await deleteScripture(scripture.id);
                router.push("/scriptures");
              }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Items
          </h2>
          {!addingItem && (
            <button
              type="button"
              onClick={() => setAddingItem(true)}
              className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800"
            >
              Add item
            </button>
          )}
        </div>

        <YoutubeImport scriptureId={scripture.id} />
        <PdfDiscovery scriptureId={scripture.id} defaultQuery={scripture.title} />
        <GitaImport scriptureId={scripture.id} />

        {addingItem && (
          <ItemForm scriptureId={scripture.id} onDone={() => setAddingItem(false)} />
        )}

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-amber-900/20 bg-white/60 p-8 text-center dark:border-amber-100/20 dark:bg-neutral-900/40">
            <p className="text-neutral-600 dark:text-neutral-400">No items yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item, index) => (
              <ItemRow
                key={item.id}
                item={item}
                canMoveUp={index > 0}
                canMoveDown={index < items.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
