"use client";

import { useState } from "react";

/**
 * A destructive-action button that requires a second click to actually
 * fire. Clicking once swaps the label for "Confirm? / Cancel"; clicking
 * elsewhere or Cancel backs out without doing anything.
 */
export default function ConfirmButton({
  onConfirm,
  label,
  confirmLabel = "Confirm",
  className = "",
}: {
  onConfirm: () => void | Promise<void>;
  label: string;
  confirmLabel?: string;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={
          className ||
          "rounded-md px-2 py-1 text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        }
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={async () => {
          await onConfirm();
          setConfirming(false);
        }}
        className="rounded-md bg-red-700 px-2 py-1 text-sm font-medium text-white hover:bg-red-800"
      >
        {confirmLabel}?
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        Cancel
      </button>
    </span>
  );
}
