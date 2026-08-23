import Link from "next/link";

export default async function ScriptureDetailPage({
  params,
}: PageProps<"/scriptures/[id]">) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/scriptures"
        className="text-sm text-amber-700 hover:underline dark:text-amber-400"
      >
        ← Back to Scriptures
      </Link>

      <h1 className="text-xl font-semibold tracking-tight text-amber-900 dark:text-amber-100">
        Scripture detail
      </h1>

      <div className="rounded-lg border border-dashed border-amber-900/20 bg-white/60 p-8 text-center dark:border-amber-100/20 dark:bg-neutral-900/40">
        <p className="text-neutral-600 dark:text-neutral-400">
          Placeholder for scripture{" "}
          <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-sm dark:bg-white/10">
            {id}
          </code>
          .
        </p>
        <p className="mt-1 text-sm text-neutral-400 dark:text-neutral-500">
          Item lists, progress, and notes arrive in Phase 1.
        </p>
      </div>
    </div>
  );
}
