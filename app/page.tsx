"use client";

import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDashboardStats } from "@/lib/stats";

function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  if (hours < 0.05) return "0h";
  return `${hours.toFixed(1)}h`;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-amber-900/10 bg-white p-4 dark:border-amber-100/10 dark:bg-neutral-900">
      <span className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <span className="text-2xl font-semibold text-amber-900 dark:text-amber-100">
        {value}
      </span>
    </div>
  );
}

export default function Home() {
  const stats = useDashboardStats();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-amber-900 dark:text-amber-100">
          Dashboard
        </h1>
        <p className="mt-2 max-w-prose text-neutral-600 dark:text-neutral-400">
          Every number below is computed live from your Items and Watch
          Sessions — nothing here is a stored aggregate, so it can never
          drift out of sync (see ARCHITECTURE.md §1).
        </p>
      </div>

      {stats === undefined ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : stats.scriptures.length === 0 ? (
        <div className="rounded-lg border border-dashed border-amber-900/20 bg-white/60 p-8 text-center dark:border-amber-100/20 dark:bg-neutral-900/40">
          <p className="text-neutral-600 dark:text-neutral-400">
            No scriptures yet — there&apos;s nothing to show here.
          </p>
          <Link
            href="/scriptures"
            className="mt-2 inline-block text-sm text-amber-700 hover:underline dark:text-amber-400"
          >
            Create your first scripture →
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard label="Hours watched" value={formatHours(stats.watchedSeconds)} />
            <SummaryCard label="Hours read" value={formatHours(stats.readSeconds)} />
            <SummaryCard label="Completed this month" value={String(stats.completedThisMonth)} />
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Progress by scripture
            </h2>
            <div className="flex flex-col gap-3">
              {stats.scriptures.map((s) => (
                <Link
                  key={s.scriptureId}
                  href={`/scriptures/${s.scriptureId}`}
                  className="flex flex-col gap-2 rounded-lg border border-amber-900/10 bg-white p-4 transition-colors hover:border-amber-700/40 dark:border-amber-100/10 dark:bg-neutral-900"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-amber-900 dark:text-amber-100">
                      {s.title}
                    </span>
                    <span className="text-sm text-neutral-500 dark:text-neutral-400">
                      {s.percentage}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-amber-700"
                      style={{ width: `${s.percentage}%` }}
                    />
                  </div>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    {s.completed} completed · {s.pending} pending · {s.total} total
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Completions by month (last 12 months, all scriptures)
            </h2>
            <div className="h-64 rounded-lg border border-amber-900/10 bg-white p-4 dark:border-amber-100/10 dark:bg-neutral-900">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthly} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-800" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={30} />
                  <Tooltip
                    formatter={(value) => [`${value} completed`, ""]}
                    labelStyle={{ color: "#78350f" }}
                  />
                  <Bar dataKey="count" fill="#b45309" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
