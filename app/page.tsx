"use client";

import { useEffect, useRef, useState } from "react";
import type { Submission } from "@/lib/types";

const VOTED_KEY = "voted-submissions";

// Per-device vote memory. Not tamper-proof (clearing storage resets it), but
// it stops casual double-voting without making students log in.
function loadVoted(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(VOTED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveVoted(voted: Set<string>) {
  try {
    localStorage.setItem(VOTED_KEY, JSON.stringify([...voted]));
  } catch {
    // Storage blocked (private mode etc.) — vote still counts server-side.
  }
}

function rank(list: Submission[]) {
  return [...list].sort(
    (a, b) => b.votes - a.votes || b.created_at.localeCompare(a.created_at),
  );
}

export default function Home() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [voted, setVoted] = useState<Set<string>>(loadVoted);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Set when the server thinks the draft repeats an existing idea.
  const [duplicate, setDuplicate] = useState<Submission | null>(null);
  // Browsing is the default; the submit box opens on demand.
  const [composerOpen, setComposerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The "Add feedback" button that opened the box, so focus can return to it.
  const openerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!composerOpen) return;
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ block: "center" });
  }, [composerOpen]);

  function openComposer(e: React.MouseEvent<HTMLButtonElement>) {
    openerRef.current = e.currentTarget;
    setNotice(null);
    setComposerOpen(true);
  }

  function closeComposer() {
    setComposerOpen(false);
    setDuplicate(null);
    openerRef.current?.focus();
  }

  // Debounced search: wait until typing pauses, and abort the previous request
  // so a slow response for "lun" can't overwrite the results for "lunch".
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        const q = query.trim();
        fetch(`/api/submissions${q ? `?q=${encodeURIComponent(q)}` : ""}`, {
          signal: controller.signal,
        })
          .then((res) => (res.ok ? res.json() : Promise.reject()))
          .then((data) => {
            setSubmissions(data);
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
  }, [query]);

  function markVoted(id: string) {
    setVoted((prev) => {
      const next = new Set(prev).add(id);
      saveVoted(next);
      return next;
    });
  }

  // force = the student saw the suggested match and wants to post anyway.
  async function submit(force: boolean) {
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.duplicate) {
        setDuplicate(data.duplicate);
        return;
      }
      setDuplicate(null);
      setSubmissions((prev) => rank([data, ...prev]));
      // The author's own submission already counts as their vote.
      markVoted(data.id);
      setText("");
      // Clear any search so the new item is visible in the full list.
      setQuery("");
      closeComposer();
      setNotice("Thanks — your feedback was posted.");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Could not submit.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit(false);
  }

  async function upvoteInstead(item: Submission) {
    const votes = await handleVote(item.id);
    if (votes === null) return;
    // The match may be hidden by an active search, so make sure it's listed.
    setSubmissions((prev) =>
      rank(
        prev.some((s) => s.id === item.id)
          ? prev
          : [{ ...item, votes }, ...prev],
      ),
    );
    setText("");
    closeComposer();
    setNotice("Thanks — your vote was added to the existing idea.");
  }

  // Returns the new vote count, or null if the vote didn't go through.
  async function handleVote(id: string): Promise<number | null> {
    if (voted.has(id)) return null;
    markVoted(id);
    setError(null);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSubmissions((prev) =>
        rank(prev.map((s) => (s.id === id ? { ...s, votes: data.votes } : s))),
      );
      return data.votes;
    } catch (err) {
      // Roll back so the student can try again.
      setVoted((prev) => {
        const next = new Set(prev);
        next.delete(id);
        saveVoted(next);
        return next;
      });
      setError(err instanceof Error && err.message ? err.message : "Could not vote.");
      return null;
    }
  }

  const searching = query.trim() !== "";

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-4xl items-end justify-between gap-6 px-3 pt-5 pb-4 sm:px-6 sm:pt-7 sm:pb-5">
          <div>
            <h1 className="text-[28px] leading-none font-extrabold tracking-[-0.02em] sm:text-[34px]">
              SpeakUp
            </h1>
            <p className="mt-2.5 text-[15px] leading-snug font-semibold sm:mt-3 sm:text-base">
              Anonymous feedback for our school — what should change?
            </p>
            <p className="mt-0.5 text-sm leading-snug text-muted">
              Upvote the ideas you agree with, or add your own.
            </p>
          </div>
          <button
            onClick={openComposer}
            aria-expanded={composerOpen}
            aria-controls="composer"
            className="hidden h-11 shrink-0 items-center rounded bg-accent px-4 font-bold text-on-accent hover:bg-accent-hover sm:inline-flex"
          >
            + Add feedback
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-3 pt-3 pb-28 sm:px-6 sm:pt-5 sm:pb-10">
        {composerOpen && (
          <section
            id="composer"
            aria-label="Add feedback"
            onKeyDown={(e) => e.key === "Escape" && closeComposer()}
            className="rounded border border-line-strong bg-surface"
          >
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
              <h2 className="text-base font-extrabold">Add feedback</h2>
              <span className="text-xs text-muted">Anonymous</span>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">What should our school change?</span>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    // Editing the draft makes any earlier match stale.
                    setDuplicate(null);
                    setNotice(null);
                  }}
                  maxLength={500}
                  rows={3}
                  className="w-full rounded border border-line-strong bg-background p-2.5"
                />
              </label>

              {duplicate && (
                <div role="alert" className="rounded border border-accent bg-background">
                  <p className="border-b border-line px-3 py-2.5 text-sm font-extrabold">
                    This looks like an existing idea
                  </p>
                  <div className="grid grid-cols-[3.25rem_minmax(0,1fr)]">
                    <div className="flex flex-col items-center justify-center border-r border-line bg-sunken text-accent-text">
                      <span aria-hidden className="text-[10px]">▲</span>
                      <span className="text-lg font-extrabold tabular-nums">
                        {duplicate.votes}
                        <span className="sr-only"> votes</span>
                      </span>
                    </div>
                    <p className="px-3 py-2.5 text-sm leading-snug break-words whitespace-pre-wrap">
                      {duplicate.text}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 border-t border-line">
                    {voted.has(duplicate.id) ? (
                      <span className="flex min-h-12 items-center justify-center border-r border-line px-2 text-center text-sm text-muted">
                        You already upvoted this one.
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => upvoteInstead(duplicate)}
                        className="min-h-12 border-r border-line bg-accent px-2 text-sm font-extrabold text-on-accent hover:bg-accent-hover"
                      >
                        Upvote it instead
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => submit(true)}
                      disabled={submitting}
                      className="min-h-12 bg-surface px-2 text-sm hover:bg-sunken disabled:opacity-40"
                    >
                      {submitting ? "Submitting…" : "Submit mine anyway"}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <button
                  type="button"
                  onClick={closeComposer}
                  className="h-12 rounded border border-line-strong bg-surface px-5 hover:bg-sunken sm:h-11"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !text.trim()}
                  className="h-12 rounded bg-accent px-5 font-extrabold text-on-accent hover:bg-accent-hover disabled:opacity-40 disabled:hover:bg-accent sm:h-11"
                >
                  {submitting ? "Submitting…" : "Submit"}
                </button>
              </div>
            </form>
          </section>
        )}

        {notice && (
          <p role="status" className="rounded border border-line bg-surface px-3 py-2 text-sm text-success">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded border border-line bg-surface px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <h2 className="text-xs font-bold tracking-[0.08em] whitespace-nowrap text-muted uppercase">
            {searching ? "Matches" : "Top ideas"}
            {!loading && ` · ${submissions.length}`}
          </h2>
          <label className="flex flex-1">
            <span className="sr-only">Search feedback</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
              placeholder="Search — already suggested?"
              className="h-11 w-full rounded border border-line-strong bg-surface px-3 sm:h-10"
            />
          </label>
        </div>

        <div>
          {/* Column labels share the rows' grid so they line up at every width.
              Hidden from screen readers: each vote button already says its count. */}
          {submissions.length > 0 && (
            <div
              aria-hidden
              className="grid grid-cols-[4rem_minmax(0,1fr)] px-px pb-1.5 text-[11px] font-bold tracking-[0.1em] text-muted uppercase sm:grid-cols-[4.5rem_minmax(0,1fr)]"
            >
              <span className="text-center">Votes</span>
              <span className="px-3 sm:px-4">Ideas</span>
            </div>
          )}
          <ul className="divide-y divide-line overflow-hidden rounded border border-line">
            {loading && <li className="bg-surface px-4 py-4 text-muted">Loading…</li>}
            {!loading && submissions.length === 0 && (
              <li className="bg-surface px-4 py-4 text-muted">
                {searching
                  ? "No matches. Add it as new feedback."
                  : "No feedback yet. Be the first."}
              </li>
            )}
            {submissions.map((s) => {
              const hasVoted = voted.has(s.id);
              return (
                <li
                  key={s.id}
                  className="grid grid-cols-[4rem_minmax(0,1fr)] bg-surface sm:grid-cols-[4.5rem_minmax(0,1fr)]"
                >
                  <button
                    onClick={() => handleVote(s.id)}
                    disabled={hasVoted}
                    aria-label={`${hasVoted ? "Already upvoted" : "Upvote"}, ${s.votes} ${s.votes === 1 ? "vote" : "votes"}`}
                    className="flex min-h-16 flex-col items-center justify-center border-r border-line bg-sunken text-accent-text hover:bg-accent-soft disabled:bg-accent disabled:text-on-accent"
                  >
                    <span aria-hidden className="text-[10px] leading-none">▲</span>
                    <span className="text-xl leading-tight font-extrabold tabular-nums">
                      {s.votes}
                    </span>
                  </button>
                  {/* Display-only cap: at most two lines, then an ellipsis. The
                      full text stays in the DOM (screen readers read all of it)
                      and in the title tooltip on hover. Vertical spacing is
                      margin, not padding: line-clamp clips at the padding
                      edge, so padding would let a third line peek through. */}
                  <p
                    title={s.text}
                    className="my-3 line-clamp-2 self-center px-3 text-[15px] leading-snug break-words whitespace-pre-wrap sm:px-4 sm:text-base"
                  >
                    {s.text}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </main>

      {!composerOpen && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-background px-3 pt-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:hidden">
          <button
            onClick={openComposer}
            aria-expanded={composerOpen}
            aria-controls="composer"
            className="h-13 w-full rounded bg-accent text-base font-extrabold text-on-accent hover:bg-accent-hover"
          >
            + Add feedback
          </button>
        </div>
      )}
    </>
  );
}
