"use client";

import { useEffect, useRef, useState } from "react";
import { categoryFor } from "@/lib/categories";
import type { Submission } from "@/lib/types";
import Splash from "./Splash";

const VOTED_KEY = "voted-submissions";
// Ideas this device posted. Their author's vote is the built-in first vote,
// so it stays locked: un-voting would hit the server's floor of 1 and then
// let the author vote a second time.
const OWN_KEY = "own-submissions";
const TOAST_MS = 3000;

// Per-device vote memory. Not tamper-proof (clearing storage resets it), but
// it stops casual double-voting without making students log in.
function loadSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // Storage blocked (private mode etc.) — votes still count server-side.
  }
}

function rank(list: Submission[]) {
  return [...list].sort(
    (a, b) => b.votes - a.votes || b.created_at.localeCompare(a.created_at),
  );
}

// Small upvote caret: an outline when idle, a solid caret once voted.
function Caret({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-5"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
    >
      <path d="M12 7l6.5 9h-13z" />
    </svg>
  );
}

export default function Home() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [voted, setVoted] = useState<Set<string>>(() => loadSet(VOTED_KEY));
  const [own, setOwn] = useState<Set<string>>(() => loadSet(OWN_KEY));
  // Ideas with a vote request in flight; extra taps on them are ignored so a
  // fast double-tap can't send an up and a down that race each other.
  const pendingRef = useRef<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Transient confirmation; `id` restarts the timer when a new one replaces it.
  const [toast, setToast] = useState<{ id: number; msg: string; leaving: boolean } | null>(
    null,
  );
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

  // Auto-dismiss: start the exit animation, then remove the toast.
  const toastId = toast?.id;
  useEffect(() => {
    if (toastId === undefined) return;
    const leave = setTimeout(
      () => setToast((t) => (t?.id === toastId ? { ...t, leaving: true } : t)),
      TOAST_MS,
    );
    const remove = setTimeout(
      () => setToast((t) => (t?.id === toastId ? null : t)),
      TOAST_MS + 240,
    );
    return () => {
      clearTimeout(leave);
      clearTimeout(remove);
    };
  }, [toastId]);

  const toastSeq = useRef(0);
  function showToast(msg: string) {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, msg, leaving: false });
  }

  function openComposer(e: React.MouseEvent<HTMLButtonElement>) {
    openerRef.current = e.currentTarget;
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

  // Record (or forget) this device's vote on an idea, in state and storage.
  function setVotedFor(id: string, on: boolean) {
    setVoted((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      saveSet(VOTED_KEY, next);
      return next;
    });
  }

  // force = the student saw the suggested match and wants to post anyway.
  async function submit(force: boolean) {
    setError(null);
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
      // The author's own submission already counts as their vote, and that
      // vote can't be removed (see OWN_KEY).
      setVotedFor(data.id, true);
      setOwn((prev) => {
        const next = new Set(prev).add(data.id);
        saveSet(OWN_KEY, next);
        return next;
      });
      setText("");
      // Clear any search so the new item is visible in the full list.
      setQuery("");
      closeComposer();
      showToast("Thanks — your feedback was posted.");
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
    const votes = await sendVote(item.id, "up");
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
    showToast("Thanks — your vote was added to the existing idea.");
  }

  // Add ("up") or remove ("down") this device's vote. The button flips
  // immediately; the count comes from the server, which applies the change
  // with the same compare-and-swap path either way. Returns the new count, or
  // null if nothing was sent or the request failed (state is rolled back).
  async function sendVote(id: string, action: "up" | "down"): Promise<number | null> {
    if (pendingRef.current.has(id)) return null;
    if (action === "up" && voted.has(id)) return null;
    if (action === "down" && (!voted.has(id) || own.has(id))) return null;
    pendingRef.current.add(id);
    setVotedFor(id, action === "up");
    setError(null);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSubmissions((prev) =>
        rank(prev.map((s) => (s.id === id ? { ...s, votes: data.votes } : s))),
      );
      return data.votes;
    } catch (err) {
      // Roll back so the button matches what the server has.
      setVotedFor(id, action !== "up");
      setError(err instanceof Error && err.message ? err.message : "Could not update vote.");
      return null;
    } finally {
      pendingRef.current.delete(id);
    }
  }

  function toggleVote(id: string) {
    sendVote(id, voted.has(id) ? "down" : "up");
  }

  const searching = query.trim() !== "";

  return (
    <>
      {/* Outside .theme-v2 on purpose: the splash keeps the #0F0F0F ground its
          logo was blended into. */}
      <Splash />

      {/* design-v2: .theme-v2 swaps in the softer palette for this page only
          (see globals.css). font-sans is Geist, which has a real medium
          weight; Arial doesn't. */}
      <div className="theme-v2 flex flex-1 flex-col bg-background font-sans text-foreground">
        <header className="border-b border-line px-4 pt-7 pb-6 text-center sm:px-6 sm:pt-10 sm:pb-8">
          <h1 className="font-display text-[44px] leading-none tracking-[-0.03em] sm:text-7xl">
            SHOUT<span className="text-accent-text">OUT</span>
          </h1>
          <p className="mt-3 text-lg leading-snug font-semibold text-balance sm:mt-4 sm:text-[22px]">
            Feedback — what should change around here?
          </p>
        </header>

        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pt-5 pb-32 sm:gap-6 sm:px-6 sm:pt-8 sm:pb-14">
          {composerOpen && (
            <section
              id="composer"
              aria-label="Add feedback"
              onKeyDown={(e) => e.key === "Escape" && closeComposer()}
              className="rounded-md border border-line bg-surface"
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h2 className="text-lg font-semibold">Add feedback</h2>
                <span className="text-sm text-muted">Anonymous</span>
              </div>
              <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-base text-muted">What should our school change?</span>
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      // Editing the draft makes any earlier match stale.
                      setDuplicate(null);
                    }}
                    maxLength={500}
                    rows={3}
                    className="w-full rounded-md border border-line-strong bg-background p-3 text-lg outline-none focus:border-accent"
                  />
                </label>

                {duplicate && (
                  <div role="alert" className="rounded-md border border-accent bg-background">
                    <p className="border-b border-line px-3 py-2.5 text-base font-semibold">
                      This looks like an existing idea
                    </p>
                    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center">
                      <div className="flex flex-col items-center justify-center py-2 text-accent-text">
                        <Caret active={false} />
                        <span className="text-lg leading-none font-semibold tabular-nums">
                          {duplicate.votes}
                          <span className="sr-only"> votes</span>
                        </span>
                      </div>
                      <p className="py-2.5 pr-3 text-base leading-snug font-medium break-words whitespace-pre-wrap">
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
                          className="min-h-14 border-r border-line bg-accent px-2 text-base font-semibold text-on-accent hover:bg-accent-hover"
                        >
                          Upvote it instead
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => submit(true)}
                        disabled={submitting}
                        className="min-h-14 px-2 text-base hover:bg-surface disabled:opacity-40"
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
                    className="h-14 rounded-md border border-line-strong px-6 text-lg hover:bg-background"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !text.trim()}
                    className="h-14 rounded-md bg-accent px-6 text-lg font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-40 disabled:hover:bg-accent"
                  >
                    {submitting ? "Submitting…" : "Submit"}
                  </button>
                </div>
              </form>
            </section>
          )}

          {error && (
            <p role="alert" className="rounded-md border border-line px-4 py-3 text-base text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-2.5">
            <label className="relative flex flex-1 items-center">
              <span className="sr-only">Search feedback</span>
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-4 size-5 text-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              {/* Focus state is the accent border (3.5:1 against the field),
                  replacing the default outline. */}
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={100}
                placeholder="Search"
                className="h-14 w-full rounded-md border border-transparent bg-surface pr-4 pl-12 text-lg outline-none transition-colors hover:border-line focus:border-accent"
              />
            </label>
            <button
              onClick={openComposer}
              aria-expanded={composerOpen}
              aria-controls="composer"
              className="hidden h-14 shrink-0 items-center rounded-md bg-accent px-6 text-lg font-semibold text-on-accent hover:bg-accent-hover sm:inline-flex"
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
                className="grid grid-cols-[4rem_minmax(0,1fr)] border-b border-line pb-2.5 font-display text-[13px] leading-none tracking-[-0.01em] text-muted uppercase sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:text-sm"
              >
                <span className="text-center">Votes</span>
                <span className="pl-3 sm:pl-4">Ideas</span>
              </div>
            )}
            <ul className="divide-y divide-line">
              {loading && <li className="py-6 text-muted">Loading…</li>}
              {!loading && submissions.length === 0 && (
                <li className="py-6 text-muted">
                  {searching
                    ? "No matches. Add it as new feedback."
                    : "No feedback yet. Be the first."}
                </li>
              )}
              {submissions.map((s) => {
                const hasVoted = voted.has(s.id);
                const isOwn = own.has(s.id);
                const category = categoryFor(s.text);
                return (
                  <li
                    key={s.id}
                    className="grid grid-cols-[4rem_minmax(0,1fr)] items-center py-4 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:py-5"
                  >
                    {/* Toggle: tap to upvote, tap again to take the vote back.
                        Inline and transparent; coral only when this device has
                        voted. aria-pressed tells screen readers the state. The
                        author's own idea stays locked (see OWN_KEY). */}
                    <button
                      onClick={() => toggleVote(s.id)}
                      disabled={isOwn}
                      aria-pressed={hasVoted}
                      aria-label={`${isOwn ? "Your idea" : "Upvote"}, ${s.votes} ${s.votes === 1 ? "vote" : "votes"}`}
                      title={isOwn ? "Your idea — your vote is already counted" : hasVoted ? "Remove your vote" : "Upvote"}
                      className={`flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 justify-self-center rounded-md px-2 py-1 transition-colors disabled:cursor-default ${
                        hasVoted ? "text-accent-text" : "text-muted hover:text-foreground"
                      }`}
                    >
                      <Caret active={hasVoted} />
                      <span
                        className={`text-base leading-none font-semibold tabular-nums ${
                          hasVoted ? "text-accent-text" : "text-foreground"
                        }`}
                      >
                        {s.votes}
                      </span>
                    </button>
                    <div className="min-w-0 pl-3 sm:pl-4">
                      {/* Display-only cap: at most two lines, then an ellipsis.
                          The full text stays in the DOM (screen readers read
                          all of it) and in the title tooltip on hover. Keep
                          vertical padding off this element: line-clamp clips
                          at the padding edge, so a third line would peek
                          through. */}
                      <p
                        title={s.text}
                        className="line-clamp-2 text-[17px] leading-snug font-medium break-words whitespace-pre-wrap sm:text-lg"
                      >
                        {s.text}
                      </p>
                      {category && (
                        <span className="mt-2 inline-block rounded bg-accent-2-soft px-2 py-0.5 text-xs font-medium tracking-wide text-accent-2">
                          {category}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </main>

        {!composerOpen && (
          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-background px-4 pt-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:hidden">
            <button
              onClick={openComposer}
              aria-expanded={composerOpen}
              aria-controls="composer"
              className="h-15 w-full rounded-md bg-accent text-xl font-semibold text-on-accent hover:bg-accent-hover"
            >
              + Add feedback
            </button>
          </div>
        )}

        {/* Toast region is always mounted so screen readers announce new
            messages. Sits above the mobile add bar. */}
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-4 sm:bottom-8"
        >
          {toast && (
            <p
              key={toast.id}
              data-leaving={toast.leaving}
              className="toast rounded-md border border-line bg-toast px-4 py-3 text-base font-medium text-foreground"
            >
              <span className="mr-2 text-success" aria-hidden>
                ✓
              </span>
              {toast.msg}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
