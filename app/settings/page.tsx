export const metadata = {
  title: "Settings — Scripture Tracker",
};

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight text-amber-900 dark:text-amber-100">
        Settings
      </h1>

      <div className="rounded-lg border border-dashed border-amber-900/20 bg-white/60 p-8 text-center dark:border-amber-100/20 dark:bg-neutral-900/40">
        <p className="text-neutral-600 dark:text-neutral-400">
          Nothing to configure yet.
        </p>
        <p className="mt-1 text-sm text-neutral-400 dark:text-neutral-500">
          Cloud sync, export/import, and preferences arrive in later phases.
        </p>
      </div>
    </div>
  );
}
