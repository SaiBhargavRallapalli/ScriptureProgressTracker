"use client";

import { useState } from "react";
import Link from "next/link";
import ScriptureForm from "@/components/ScriptureForm";
import ConfirmButton from "@/components/ConfirmButton";
import {
  createScripture,
  deleteScripture,
  updateScripture,
  useScriptureProgress,
  useScriptures,
  type ScriptureInput,
} from "@/lib/scriptures";
import type { Scripture } from "@/lib/db";

function ProgressBar({ scriptureId }: { scriptureId: string }) {
  const progress = useScriptureProgress(scriptureId);
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-full rounded-full bg-amber-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-neutral-500 dark:text-neutral-400">
        {progress.completed}/{progress.total} items
      </span>
    </div>
  );
}

function ScriptureCard({ scripture }: { scripture: Scripture }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ScriptureForm
        submitLabel="Save"
        initial={{
          title: scripture.title,
          description: scripture.description,
          startDate: scripture.startDate,
          targetDate: scripture.targetDate,
        }}
        onCancel={() => setEditing(false)}
        onSubmit={async (input: ScriptureInput) => {
          await updateScripture(scripture.id, input);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-900/10 bg-white p-4 dark:border-amber-100/10 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/scriptures/${scripture.id}`}
          className="font-medium text-amber-900 hover:underline dark:text-amber-100"
        >
          {scripture.title}
        </Link>
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
            onConfirm={() => deleteScripture(scripture.id)}
          />
        </div>
      </div>

      {scripture.description && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {scripture.description}
        </p>
      )}

      <ProgressBar scriptureId={scripture.id} />

      {(scripture.startDate || scripture.targetDate) && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          {scripture.startDate && `Start: ${scripture.startDate}`}
          {scripture.startDate && scripture.targetDate && " · "}
          {scripture.targetDate && `Target: ${scripture.targetDate}`}
        </p>
      )}
    </div>
  );
}

export default function ScripturesPage() {
  const scriptures = useScriptures();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-amber-900 dark:text-amber-100">
          Scriptures
        </h1>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800"
          >
            New scripture
          </button>
        )}
      </div>

      {creating && (
        <ScriptureForm
          submitLabel="Create"
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            await createScripture(input);
            setCreating(false);
          }}
        />
      )}

      {scriptures === undefined ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : scriptures.length === 0 ? (
        <div className="rounded-lg border border-dashed border-amber-900/20 bg-white/60 p-8 text-center dark:border-amber-100/20 dark:bg-neutral-900/40">
          <p className="text-neutral-600 dark:text-neutral-400">
            No scriptures yet.
          </p>
          <p className="mt-1 text-sm text-neutral-400 dark:text-neutral-500">
            Create one above to start tracking items.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {scriptures.map((scripture) => (
            <ScriptureCard key={scripture.id} scripture={scripture} />
          ))}
        </div>
      )}
    </div>
  );
}
