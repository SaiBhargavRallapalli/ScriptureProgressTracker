"use client";

import { useEffect, type ReactNode } from "react";

export default function Modal({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          {title ? (
            <h3 className="font-medium text-neutral-800 dark:text-neutral-100">{title}</h3>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
