"use client";

import { useEffect, useState } from "react";
import type { Submission } from "@/lib/types";

type Sort = "top" | "new";

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
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Staff Dashboard</h1>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="rounded border border-current/20 px-3 py-1 text-sm"
        >
          Refresh
        </button>
      </div>
      <p className="mt-1 text-sm opacity-70">
        Anonymous student feedback, ranked by how many students agree.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded border border-current/15 p-3">
          <div className="text-2xl font-bold">{submissions.length}</div>
          <div className="text-sm opacity-70">Submissions in view</div>
        </div>
        <div className="rounded border border-current/15 p-3">
          <div className="text-2xl font-bold">{totalVotes}</div>
          <div className="text-sm opacity-70">Student votes in view</div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={100}
          placeholder="Search feedback…"
          aria-label="Search feedback"
          className="flex-1 rounded border border-current/20 bg-transparent p-2"
        />
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="Time range"
          className="rounded border border-current/20 bg-background p-2"
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
          className="rounded border border-current/20 bg-background p-2"
        >
          <option value="top">Most votes</option>
          <option value="new">Newest</option>
        </select>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <ol className="mt-6 flex flex-col gap-2">
        {loading && <li className="opacity-60">Loading…</li>}
        {!loading && submissions.length === 0 && (
          <li className="opacity-60">No feedback matches these filters.</li>
        )}
        {submissions.map((s, i) => (
          <li
            key={s.id}
            className="flex items-start gap-3 rounded border border-current/15 p-3"
          >
            <span className="w-8 shrink-0 text-right font-mono text-sm opacity-60">
              {i + 1}.
            </span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-pre-wrap break-words">{s.text}</p>
              <p className="mt-1 text-xs opacity-60">{formatDate(s.created_at)}</p>
            </div>
            <span className="shrink-0 text-right">
              <span className="block text-lg font-bold">{s.votes}</span>
              <span className="block text-xs opacity-60">
                {s.votes === 1 ? "vote" : "votes"}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}
