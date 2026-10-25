"use client";

import { useEffect, useState } from "react";
import type { Submission } from "@/lib/types";

type Sort = "top" | "new";

// A filter that differs from its default gets the accent ring.
const IDLE = "border-line-strong bg-surface";
const ACTIVE = "border-accent bg-accent-soft";

const RANGES = [
  { label: "All time", days: 0 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 7 days", days: 7 },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function StaffDashboard() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("top");
  const [days, setDays] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Same debounce + abort pattern as the student page.
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ sort });
    if (query.trim()) params.set("q", query.trim());
    if (days) params.set("days", String(days));

    const timer = setTimeout(
      () => {
        fetch(`/api/submissions?${params}`, { signal: controller.signal })
          .then((res) => (res.ok ? res.json() : Promise.reject()))
          .then((data) => {
            setSubmissions(data);
            setError(null);
            setLoading(false);
          })
          .catch(() => {
            if (controller.signal.aborted) return;
            setError("Could not load feedback.");
            setLoading(false);
          });
      },
      query ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, sort, days, refreshKey]);

  const totalVotes = submissions.reduce((sum, s) => sum + s.votes, 0);

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-5xl items-end justify-between gap-6 px-3 pt-5 pb-4 sm:px-6 sm:pt-7 sm:pb-5">
          <div>
            <h1 className="text-2xl leading-none font-extrabold tracking-tight sm:text-[28px]">
              Staff Dashboard
            </h1>
            <p className="mt-1.5 text-sm text-muted">
              Anonymous student feedback, ranked by how many students agree.
            </p>
          </div>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="h-10 shrink-0 rounded border border-line-strong bg-surface px-4 text-sm font-bold hover:bg-sunken"
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 px-3 pt-3 pb-10 sm:px-6 sm:pt-5">
        <div className="grid grid-cols-2 divide-x divide-line overflow-hidden rounded border border-line bg-surface">
          <div className="px-4 py-3 sm:px-5 sm:py-4">
            <div className="text-2xl font-extrabold tabular-nums sm:text-[32px]">
              {submissions.length}
            </div>
            <div className="text-sm text-muted">Submissions in view</div>
          </div>
          <div className="px-4 py-3 sm:px-5 sm:py-4">
            <div className="text-2xl font-extrabold text-accent-text tabular-nums sm:text-[32px]">
              {totalVotes}
            </div>
            <div className="text-sm text-muted">Student votes in view</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_10rem]">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={100}
            placeholder="Search feedback…"
            aria-label="Search feedback"
            className={`col-span-2 h-11 rounded border px-3 sm:col-span-1 sm:h-10 ${query.trim() ? ACTIVE : IDLE}`}
          />
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Time range"
            className={`h-11 rounded border px-2 sm:h-10 ${days ? ACTIVE : IDLE}`}
          >
            {RANGES.map((r) => (
              <option key={r.days} value={r.days}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort order"
            className={`h-11 rounded border px-2 sm:h-10 ${sort !== "top" ? ACTIVE : IDLE}`}
          >
            <option value="top">Most votes</option>
            <option value="new">Newest</option>
          </select>
        </div>

        {error && (
          <p role="alert" className="rounded border border-line bg-surface px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <ol className="divide-y divide-line overflow-hidden rounded border border-line">
          {loading && <li className="bg-surface px-4 py-4 text-muted">Loading…</li>}
          {!loading && submissions.length === 0 && (
            <li className="bg-surface px-4 py-4 text-muted">No feedback matches these filters.</li>
          )}
          {submissions.map((s, i) => (
            <li
              key={s.id}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem] bg-surface sm:grid-cols-[3rem_minmax(0,1fr)_5.5rem]"
            >
              <span className="flex items-center justify-center border-r border-line font-mono text-sm text-muted">
                {i + 1}
              </span>
              <div className="min-w-0 px-3 py-3 sm:px-4">
                <p className="leading-snug break-words whitespace-pre-wrap">{s.text}</p>
                <p className="mt-1 text-xs text-muted">{formatDate(s.created_at)}</p>
              </div>
              <span className="flex flex-col items-center justify-center border-l border-line bg-sunken">
                <span className="text-xl leading-tight font-extrabold text-accent-text tabular-nums">
                  {s.votes}
                </span>
                <span className="text-xs text-muted">{s.votes === 1 ? "vote" : "votes"}</span>
              </span>
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}
