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
      <header className="border-b border-line px-3 pt-6 pb-5 text-center sm:px-6 sm:pt-9 sm:pb-7">
        <h1 className="font-display text-[44px] leading-none tracking-[0.01em] sm:text-7xl">
          SHOUT<span className="text-accent-text">OUT</span>
        </h1>
        <p className="mt-3 text-lg leading-snug font-bold text-balance sm:mt-3.5 sm:text-[22px]">
          Feedback — what should change around here?
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3.5 px-3 pt-3.5 pb-32 sm:gap-4 sm:px-6 sm:pt-6 sm:pb-12">
        {composerOpen && (
          <section
            id="composer"
            aria-label="Add feedback"
            onKeyDown={(e) => e.key === "Escape" && closeComposer()}
            className="rounded border border-line-strong bg-surface"
          >
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
              <h2 className="text-lg font-extrabold">Add feedback</h2>
              <span className="text-sm text-muted">Anonymous</span>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-base text-muted">What should our school change?</span>
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
                  className="w-full rounded border border-line-strong bg-background p-3 text-lg"
                />
              </label>

              {duplicate && (
                <div role="alert" className="rounded border border-accent bg-background">
                  <p className="border-b border-line px-3 py-2.5 text-base font-extrabold">
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
                    <p className="px-3 py-2.5 text-base leading-snug break-words whitespace-pre-wrap">
                      {duplicate.text}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 border-t border-line">
                    {voted.has(duplicate.id) ? (
                      <span className="flex min-h-14 items-center justify-center border-r border-line px-2 text-center text-base text-muted">
                        You already upvoted this one.
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => upvoteInstead(duplicate)}
                        className="min-h-14 border-r border-line bg-accent px-2 text-base font-extrabold text-on-accent hover:bg-accent-hover"
                      >
                        Upvote it instead
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => submit(true)}
                      disabled={submitting}
                      className="min-h-14 bg-surface px-2 text-base hover:bg-sunken disabled:opacity-40"
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
                  className="h-14 rounded border border-line-strong bg-surface px-6 text-lg hover:bg-sunken"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !text.trim()}
                  className="h-14 rounded bg-accent px-6 text-lg font-extrabold text-on-accent hover:bg-accent-hover disabled:opacity-40 disabled:hover:bg-accent"
                >
                  {submitting ? "Submitting…" : "Submit"}
                </button>
              </div>
            </form>
          </section>
        )}

        {notice && (
          <p role="status" className="rounded border border-line bg-surface px-3.5 py-2.5 text-base text-success">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded border border-line bg-surface px-3.5 py-2.5 text-base text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-2.5">
          <label className="flex flex-1">
            <span className="sr-only">Search feedback</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
              placeholder="Search — already suggested?"
              className="h-14 w-full rounded border border-line-strong bg-surface px-4 text-lg"
            />
          </label>
          <button
            onClick={openComposer}
            aria-expanded={composerOpen}
            aria-controls="composer"
            className="hidden h-14 shrink-0 items-center rounded bg-accent px-6 text-lg font-extrabold text-on-accent hover:bg-accent-hover sm:inline-flex"
          >
            + Add feedback
          </button>
        </div>

        <div>
          {/* The visible column labels are decorative, so give the list a real
              heading for screen-reader navigation. */}
          <h2 className="sr-only">Ideas</h2>
          {/* Column labels share the rows' grid so they line up at every width.
              Hidden from screen readers: each vote button already says its count. */}
          {submissions.length > 0 && (
            <div
              aria-hidden
              className="grid grid-cols-[5.5rem_minmax(0,1fr)] px-px pb-2 font-display text-[19px] leading-none uppercase sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:text-2xl"
            >
              <span className="text-center text-accent-text">Votes</span>
              <span className="px-3.5 sm:px-[18px]">Ideas</span>
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
                  className="grid grid-cols-[5.5rem_minmax(0,1fr)] bg-surface sm:grid-cols-[6.5rem_minmax(0,1fr)]"
                >
                  <button
                    onClick={() => handleVote(s.id)}
                    disabled={hasVoted}
                    aria-label={`${hasVoted ? "Already upvoted" : "Upvote"}, ${s.votes} ${s.votes === 1 ? "vote" : "votes"}`}
                    className="flex min-h-[76px] flex-col items-center justify-center border-r border-line bg-sunken text-accent-text hover:bg-accent-soft disabled:bg-accent disabled:text-on-accent"
                  >
                    <span aria-hidden className="text-xs leading-none">▲</span>
                    <span className="text-[26px] leading-tight font-extrabold tabular-nums sm:text-[28px]">
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
                    className="my-3.5 line-clamp-2 self-center px-3.5 text-lg leading-[1.35] break-words whitespace-pre-wrap sm:px-[18px] sm:text-xl"
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
            className="h-15 w-full rounded bg-accent text-xl font-extrabold text-on-accent hover:bg-accent-hover"
          >
            + Add feedback
          </button>
        </div>
      )}
    </>
  );
}
