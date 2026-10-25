"use client";

import { useEffect, useState } from "react";
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
    setDuplicate(null);
    setText("");
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

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-bold">School Feedback</h1>
      <p className="mt-1 text-sm text-muted">
        Anonymous. Share what should change, and upvote what you agree with.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // Editing the draft makes any earlier match stale.
            setDuplicate(null);
            setNotice(null);
          }}
          maxLength={500}
          rows={3}
          placeholder="What should our school change?"
          className="w-full rounded border border-line-strong bg-surface p-3"
        />
        <button
          type="submit"
          disabled={submitting || !text.trim()}
          className="self-end rounded bg-accent px-4 py-2 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-40 disabled:hover:bg-accent"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </form>

      {duplicate && (
        <div
          role="alert"
          className="mt-4 rounded border border-accent bg-surface p-4"
        >
          <p className="font-medium">This looks like an existing idea:</p>
          <p className="mt-2 whitespace-pre-wrap break-words rounded border border-line p-3">
            {duplicate.text}
            <span className="mt-1 block text-sm text-muted">
              {duplicate.votes} {duplicate.votes === 1 ? "vote" : "votes"}
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {voted.has(duplicate.id) ? (
              <span className="self-center text-sm text-muted">
                You already upvoted this one.
              </span>
            ) : (
              <button
                onClick={() => upvoteInstead(duplicate)}
                className="rounded bg-accent px-4 py-2 font-medium text-on-accent hover:bg-accent-hover"
              >
                Upvote it instead
              </button>
            )}
            <button
              onClick={() => submit(true)}
              disabled={submitting}
              className="rounded border border-line-strong bg-surface px-4 py-2 hover:bg-background disabled:opacity-40"
            >
              {submitting ? "Submitting…" : "Submit mine anyway"}
            </button>
            <button
              onClick={() => setDuplicate(null)}
              className="px-2 py-2 text-sm text-muted underline hover:text-foreground"
            >
              Edit
            </button>
          </div>
        </div>
      )}

      {notice && <p className="mt-4 text-sm text-success">{notice}</p>}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <label className="mt-8 block">
        <span className="text-sm font-medium">Already suggested? Search first</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={100}
          placeholder="e.g. lunch, wifi, parking"
          className="mt-1 w-full rounded border border-line-strong bg-surface p-2"
        />
      </label>

      <ul className="mt-4 flex flex-col gap-3">
        {loading && <li className="text-muted">Loading…</li>}
        {!loading && submissions.length === 0 && (
          <li className="text-muted">
            {query.trim()
              ? "No matches. Submit it as a new idea above."
              : "No feedback yet. Be the first."}
          </li>
        )}
        {submissions.map((s) => {
          const hasVoted = voted.has(s.id);
          return (
            <li
              key={s.id}
              className="flex items-start gap-3 rounded border border-line bg-surface p-3"
            >
              <button
                onClick={() => handleVote(s.id)}
                disabled={hasVoted}
                aria-label={hasVoted ? "Already upvoted" : "Upvote"}
                className="flex min-w-12 flex-col items-center rounded border border-line-strong bg-surface px-2 py-1 text-accent hover:bg-accent-soft disabled:border-accent disabled:bg-accent-soft"
              >
                <span aria-hidden>▲</span>
                <span className="font-semibold">{s.votes}</span>
              </button>
              <p className="flex-1 whitespace-pre-wrap break-words">{s.text}</p>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
