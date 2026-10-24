"use client";

import { useEffect, useState } from "react";

type Submission = {
  id: string;
  text: string;
  votes: number;
  created_at: string;
};

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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/submissions")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setSubmissions)
      .catch(() => setError("Could not load feedback."))
      .finally(() => setLoading(false));
  }, []);

  function markVoted(id: string) {
    setVoted((prev) => {
      const next = new Set(prev).add(id);
      saveVoted(next);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSubmissions((prev) => rank([data, ...prev]));
      // The author's own submission already counts as their vote.
      markVoted(data.id);
      setText("");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Could not submit.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVote(id: string) {
    if (voted.has(id)) return;
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
    } catch (err) {
      // Roll back so the student can try again.
      setVoted((prev) => {
        const next = new Set(prev);
        next.delete(id);
        saveVoted(next);
        return next;
      });
      setError(err instanceof Error && err.message ? err.message : "Could not vote.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-bold">School Feedback</h1>
      <p className="mt-1 text-sm opacity-70">
        Anonymous. Share what should change, and upvote what you agree with.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="What should our school change?"
          className="w-full rounded border border-current/20 bg-transparent p-3"
        />
        <button
          type="submit"
          disabled={submitting || !text.trim()}
          className="self-end rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-40"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <ul className="mt-8 flex flex-col gap-3">
        {loading && <li className="opacity-60">Loading…</li>}
        {!loading && submissions.length === 0 && (
          <li className="opacity-60">No feedback yet. Be the first.</li>
        )}
        {submissions.map((s) => {
          const hasVoted = voted.has(s.id);
          return (
            <li
              key={s.id}
              className="flex items-start gap-3 rounded border border-current/15 p-3"
            >
              <button
                onClick={() => handleVote(s.id)}
                disabled={hasVoted}
                aria-label={hasVoted ? "Already upvoted" : "Upvote"}
                className="flex min-w-12 flex-col items-center rounded border border-current/20 px-2 py-1 disabled:opacity-50"
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
