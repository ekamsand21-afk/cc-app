"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { categoryFor, categorySlug } from "@/lib/categories";
import type { Submission } from "@/lib/types";

type Sort = "top" | "new";

// A filter that differs from its default gets the accent outline + tint.
const IDLE = "border-line-strong bg-surface";
const ACTIVE = "border-accent bg-accent-soft";

const RANGES = [
  { label: "All time", days: 0 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 7 days", days: 7 },
];

// Shared column template: header row and data rows must match exactly.
// Phone: rank | idea (tag + date underneath) | votes.
// ≥640px: rank | idea | category | posted | votes.
const COLS =
  "grid grid-cols-[2.5rem_minmax(0,1fr)_4rem] sm:grid-cols-[3.5rem_minmax(0,1fr)_9.5rem_7.5rem_6rem]";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CategoryTag({ label }: { label: string }) {
  return (
    <span
      data-category={categorySlug(label)}
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap"
    >
      {label}
    </span>
  );
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
    // Same .theme-v4 tokens, fonts and category colours as the student page,
    // so both read as one product; the layout stays a dense ranked table.
    <div className="theme-v4 flex flex-1 flex-col bg-background font-body text-foreground">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-3.5">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <Image
              src="/loudspeaker-icon.webp"
              alt=""
              width={240}
              height={219}
              loading="eager"
              unoptimized
              className="h-7 w-auto sm:h-8"
            />
            <span className="font-heading text-xl font-extrabold tracking-[-0.02em] sm:text-[22px]">
              Shout<span className="text-brand">out</span>
            </span>
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-[#3c27b8]">
              Staff
            </span>
          </div>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border-[1.5px] border-line-strong bg-surface px-3.5 text-sm font-semibold hover:bg-accent-soft"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />
            </svg>
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 pt-5 pb-12 sm:gap-[18px] sm:px-6 sm:pt-7">
        <div>
          <h1 className="font-heading text-[26px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[32px]">
            Staff dashboard
          </h1>
          <p className="mt-1 text-sm text-muted sm:text-[15px]">
            Anonymous student feedback, ranked by how many students agree.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          <div className="rounded-[18px] border border-line bg-surface px-3.5 py-3 sm:rounded-[20px] sm:px-5 sm:py-4">
            <div className="text-xs font-semibold text-muted sm:text-[13px]">Submissions in view</div>
            <div className="mt-1 font-heading text-[28px] leading-none font-extrabold tabular-nums sm:text-[34px]">
              {submissions.length}
            </div>
          </div>
          <div className="rounded-[18px] border border-line bg-surface px-3.5 py-3 sm:rounded-[20px] sm:px-5 sm:py-4">
            <div className="text-xs font-semibold text-muted sm:text-[13px]">Student votes in view</div>
            <div className="mt-1 font-heading text-[28px] leading-none font-extrabold text-accent-text tabular-nums sm:text-[34px]">
              {totalVotes}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_10rem] sm:gap-2.5">
          <label className="relative col-span-2 flex items-center sm:col-span-1">
            <span className="sr-only">Search feedback</span>
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-3.5 size-[18px] text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
              placeholder="Search feedback"
              className={`h-11 w-full rounded-[14px] border-[1.5px] pr-3.5 pl-10 text-base outline-none focus:border-accent sm:text-[15px] ${query.trim() ? ACTIVE : IDLE}`}
            />
          </label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Time range"
            className={`h-11 rounded-[14px] border-[1.5px] px-3 text-sm font-semibold ${days ? ACTIVE : IDLE}`}
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
            className={`h-11 rounded-[14px] border-[1.5px] px-3 text-sm font-semibold ${sort !== "top" ? ACTIVE : IDLE}`}
          >
            <option value="top">Most votes</option>
            <option value="new">Newest</option>
          </select>
        </div>

        {error && (
          <p role="alert" className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}

        <div className="overflow-hidden rounded-[18px] border border-line bg-surface sm:rounded-[20px]">
          {/* Column labels (visual). Each row's cells read on their own. */}
          <div
            aria-hidden
            className={`${COLS} items-center border-b border-line bg-[#faf9ff] px-3 py-2.5 text-[11px] font-bold tracking-[0.06em] text-muted uppercase sm:px-4 sm:text-xs`}
          >
            <span>#</span>
            <span>Idea</span>
            <span className="hidden sm:block">Category</span>
            <span className="hidden sm:block">Posted</span>
            <span className="text-right">Votes</span>
          </div>
          <ol className="divide-y divide-[#eeeafb]">
            {loading && <li className="px-4 py-4 text-muted">Loading…</li>}
            {!loading && submissions.length === 0 && (
              <li className="px-4 py-4 text-muted">No feedback matches these filters.</li>
            )}
            {submissions.map((s, i) => {
              const rank = i + 1;
              const category = categoryFor(s.text);
              return (
                <li
                  key={s.id}
                  className={`${COLS} items-start px-3 py-3 sm:items-center sm:px-4`}
                >
                  {/* Rank: gold #1, violet tint for 2–3, plain after that */}
                  <span
                    className={`flex size-7 items-center justify-center rounded-[9px] font-heading text-sm font-extrabold sm:size-[30px] sm:text-[15px] ${
                      rank === 1
                        ? "bg-sun text-foreground"
                        : rank <= 3
                          ? "bg-accent-soft text-[#3c27b8]"
                          : "font-body font-bold text-muted"
                    }`}
                  >
                    <span className="sr-only">Rank </span>
                    {rank}
                  </span>
                  <div className="min-w-0 sm:pr-4">
                    <p className="text-[15px] leading-snug font-semibold break-words whitespace-pre-wrap">
                      {s.text}
                    </p>
                    {/* Phone: tag and date sit under the text */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:hidden">
                      {category && <CategoryTag label={category} />}
                      <span className="text-xs text-muted">{formatDate(s.created_at)}</span>
                    </div>
                  </div>
                  <span className="hidden sm:block">{category && <CategoryTag label={category} />}</span>
                  <span className="hidden text-[13px] text-muted sm:block">{formatDate(s.created_at)}</span>
                  {/* Read-only count, same violet treatment as the student page */}
                  <span className="inline-flex items-center gap-1 justify-self-end rounded-xl bg-accent-soft px-2 py-1 text-sm font-extrabold text-[#3c27b8] tabular-nums sm:px-2.5 sm:text-[15px]">
                    <svg
                      aria-hidden
                      viewBox="0 0 24 24"
                      className="size-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 15l6-6 6 6" />
                    </svg>
                    {s.votes}
                    <span className="sr-only"> {s.votes === 1 ? "vote" : "votes"}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </main>
    </div>
  );
}
