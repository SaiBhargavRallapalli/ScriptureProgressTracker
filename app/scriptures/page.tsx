export const metadata = {
  title: "Scriptures — Scripture Tracker",
};

export default function ScripturesPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight text-amber-900 dark:text-amber-100">
        Scriptures
      </h1>

      <div className="rounded-lg border border-dashed border-amber-900/20 bg-white/60 p-8 text-center dark:border-amber-100/20 dark:bg-neutral-900/40">
        <p className="text-neutral-600 dark:text-neutral-400">
          No scriptures yet.
        </p>
        <p className="mt-1 text-sm text-neutral-400 dark:text-neutral-500">
          Creating and importing scriptures arrives in Phase 1.
        </p>
      </div>
    </div>
  );
}
