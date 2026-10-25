"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CATEGORY_LABELS, categoryFor, categorySlug } from "@/lib/categories";
import type { Submission } from "@/lib/types";
import Splash from "./Splash";

const VOTED_KEY = "voted-submissions";
// Ideas this device posted. Their author's vote is the built-in first vote,
// so it stays locked: un-voting would hit the server's floor of 1 and then
// let the author vote a second time.
const OWN_KEY = "own-submissions";
const TOAST_MS = 3000;
const MAX_LENGTH = 500;

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

// Upvote chevron; heavier once the student has voted.
function Chevron({ active, className = "size-5" }: { active?: boolean; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.8 : 2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

function PlusIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SearchIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
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
  // Category filter chip (client-side, from the keyword tags). null = All.
  const [category, setCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Transient confirmation; `id` restarts the timer when a new one replaces it.
  const [toast, setToast] = useState<{ id: number; msg: string; leaving: boolean } | null>(
    null,
  );
  // Set when the server thinks the draft repeats an existing idea.
  const [duplicate, setDuplicate] = useState<Submission | null>(null);
  // Browsing is the default; the post sheet opens on demand.
  const [composerOpen, setComposerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // The button that opened the sheet, so focus can return to it.
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses search (the hint inside the field shows this on devices with a
  // keyboard). Ignored while typing anywhere and with modifier keys, so a "/"
  // in a post never jumps away.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (dialogRef.current?.open) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The post sheet is a native modal <dialog>: it traps focus, closes on Esc
  // and makes the page behind it inert. State drives it open/closed.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (composerOpen && !d.open) {
      d.showModal();
      textareaRef.current?.focus();
    } else if (!composerOpen && d.open) {
      d.close();
    }
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

  // Also runs on the dialog's own close event (Esc), so it must be idempotent.
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
      // Clear any search/filter so the new item is visible in the full list.
      setQuery("");
      setCategory(null);
      closeComposer();
      showToast("Thanks — your idea was posted.");
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
    showToast("Thanks — your vote was added to that idea.");
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
  const tagged = submissions.map((s) => ({ ...s, category: categoryFor(s.text) }));
  // Chips only for categories that actually have ideas, busiest first.
  const categoryCount = (c: string) => tagged.filter((s) => s.category === c).length;
  const presentCategories = CATEGORY_LABELS.filter((c) => categoryCount(c) > 0).sort(
    (a, b) => categoryCount(b) - categoryCount(a),
  );
  const visible = category ? tagged.filter((s) => s.category === category) : tagged;
  // Trending = the top 3 of the unfiltered list; hidden while searching or
  // filtering so results aren't split in two.
  const showTrending = !searching && !category && visible.length > 3;
  const trending = showTrending ? visible.slice(0, 3) : [];
  const rest = showTrending ? visible.slice(3) : visible;
  const listTitle = searching ? "Results" : category ? category : showTrending ? "More ideas" : "All ideas";

  function renderCard(s: (typeof tagged)[number], trendRank?: number) {
    const hasVoted = voted.has(s.id);
    const isOwn = own.has(s.id);
    return (
      <li
        key={s.id}
        className={`flex items-start gap-3 rounded-[20px] bg-surface p-3.5 ${
          trendRank === 1 ? "border-2 border-sun" : "border border-line"
        }`}
      >
        {/* Toggle: tap to upvote, tap again to take the vote back. Filled
            violet when this device has voted; the author's own idea stays
            locked (see OWN_KEY). aria-pressed tells screen readers. */}
        <button
          onClick={() => toggleVote(s.id)}
          disabled={isOwn}
          aria-pressed={hasVoted}
          aria-label={`${isOwn ? "Your idea" : "Upvote"}, ${s.votes} ${s.votes === 1 ? "vote" : "votes"}`}
          title={isOwn ? "Your idea — your vote is already counted" : hasVoted ? "Remove your vote" : "Upvote"}
          className={`flex h-[60px] w-[52px] flex-none flex-col items-center justify-center rounded-2xl transition-colors disabled:cursor-default ${
            hasVoted
              ? "bg-accent text-on-accent"
              : "border-[1.5px] border-line-strong bg-surface text-foreground hover:bg-accent-soft"
          }`}
        >
          <Chevron active={hasVoted} />
          <span className="text-base leading-none font-bold tabular-nums">{s.votes}</span>
        </button>
        <div className="min-w-0 flex-1 pt-0.5">
          {/* Display-only cap: three lines, then an ellipsis. Full text stays
              in the DOM (screen readers) and the hover tooltip. */}
          <p
            title={s.text}
            className="line-clamp-3 text-base leading-snug font-semibold break-words whitespace-pre-wrap"
          >
            {s.text}
          </p>
          {(trendRank || s.category) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {trendRank && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    trendRank === 1 ? "bg-sun text-foreground" : "bg-accent-soft text-[#3c27b8]"
                  }`}
                >
                  #{trendRank} trending
                </span>
              )}
              {s.category && (
                <span
                  data-category={categorySlug(s.category)}
                  className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                >
                  {s.category}
                </span>
              )}
            </div>
          )}
        </div>
      </li>
    );
  }

  return (
    <>
      {/* The splash keeps its own dark ground (its logo was blended into
          #0F0F0F), so it stays outside the themed wrapper. */}
      <Splash />

      {/* design-v4 "Bright Pop": .theme-v4 swaps in the light palette for this
          page only (see globals.css). Swap the class for .theme-v3/.theme-v2
          to compare. */}
      <div className="theme-v4 flex flex-1 flex-col bg-background font-body text-foreground">
        <div className="mx-auto w-full max-w-xl px-4 pb-36 sm:pb-40">
          {/* Top bar: brand + trust signal */}
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2">
              <Image
                src="/loudspeaker-icon.webp"
                alt=""
                width={240}
                height={219}
                loading="eager"
                unoptimized
                className="h-[34px] w-auto"
              />
              <span className="font-heading text-2xl font-extrabold tracking-[-0.02em]">
                Shout<span className="text-brand">out</span>
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-muted">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              100% anonymous
            </span>
          </div>

          {/* Hero: what it is, what happens to ideas, two actions */}
          <section className="rounded-[28px] bg-hero px-[22px] pt-6 pb-[22px] text-white">
            <span className="inline-block rounded-full bg-sun px-3 py-1 text-xs font-bold tracking-[0.04em] text-foreground uppercase">
              James Logan High
            </span>
            <h1 className="mt-4 font-heading text-[36px] leading-[1.02] font-extrabold tracking-[-0.03em] sm:text-[44px]">
              Got an idea to make school <span className="text-sun">better?</span>
            </h1>
            <p className="mt-3.5 text-base leading-relaxed text-hero-soft">
              Post what should change, and vote on what others posted. The most-upvoted ideas
              rise to the top of the staff dashboard.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                onClick={openComposer}
                className="h-[52px] rounded-2xl bg-sun text-base font-bold text-foreground hover:brightness-95"
              >
                Post an idea
              </button>
              <a
                href="#ideas"
                className="flex h-[52px] items-center justify-center rounded-2xl border-[1.5px] border-[#c4bbff] text-base font-semibold text-white hover:bg-white/10"
              >
                See top ideas
              </a>
            </div>
          </section>

          {/* How it works */}
          <section className="pt-8">
            <h2 className="font-heading text-2xl font-extrabold tracking-[-0.02em]">How it works</h2>
            <ol className="mt-3.5 flex flex-col gap-2.5">
              <li className="flex items-center gap-3.5 rounded-[20px] bg-surface px-4 py-3.5">
                <span className="flex size-10 flex-none items-center justify-center rounded-[14px] bg-[#ddf6ea] text-[#0f5a40]">
                  <SearchIcon />
                </span>
                <div>
                  <div className="text-base font-bold">1 · Search first</div>
                  <div className="mt-0.5 text-sm text-muted">See if someone already said it.</div>
                </div>
              </li>
              <li className="flex items-center gap-3.5 rounded-[20px] bg-surface px-4 py-3.5">
                <span className="flex size-10 flex-none items-center justify-center rounded-[14px] bg-[#fff1c7] text-[#7a5300]">
                  <Chevron />
                </span>
                <div>
                  <div className="text-base font-bold">2 · Upvote</div>
                  <div className="mt-0.5 text-sm text-muted">Back the ideas you agree with.</div>
                </div>
              </li>
              <li className="flex items-center gap-3.5 rounded-[20px] bg-surface px-4 py-3.5">
                <span className="flex size-10 flex-none items-center justify-center rounded-[14px] bg-[#ffe0e8] text-[#9a1f45]">
                  <PlusIcon />
                </span>
                <div>
                  <div className="text-base font-bold">3 · Post your own</div>
                  <div className="mt-0.5 text-sm text-muted">Takes seconds. No login, no name.</div>
                </div>
              </li>
            </ol>
          </section>

          {/* Ideas: search + filters first, so Trending can hide below them
              without the search box jumping under the student's finger. */}
          <section id="ideas" className="scroll-mt-4 pt-8">
            <div className="flex items-baseline justify-between">
              <h2 className="font-heading text-2xl font-extrabold tracking-[-0.02em]">Ideas</h2>
              {!loading && (
                <span className="text-[13px] font-semibold text-muted">
                  {submissions.length} {submissions.length === 1 ? "idea" : "ideas"}
                </span>
              )}
            </div>

            <label className="relative mt-3.5 flex items-center">
              <span className="sr-only">Search ideas</span>
              <SearchIcon className="pointer-events-none absolute left-4 size-5 text-muted" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={100}
                placeholder="Search ideas"
                aria-keyshortcuts="/"
                className="peer h-[52px] w-full rounded-2xl border-[1.5px] border-field-border bg-field pr-12 pl-12 text-base outline-none transition-colors focus:border-accent"
              />
              {/* Only on devices with a precise pointer (a keyboard is likely),
                  never on phones; hidden while focused or filled. */}
              <kbd
                aria-hidden
                className={`pointer-events-none absolute right-3 hidden h-6 min-w-6 items-center justify-center rounded-md bg-kbd px-1.5 font-body text-xs font-semibold text-muted sm:pointer-fine:flex peer-focus:!hidden ${
                  query ? "!hidden" : ""
                }`}
              >
                /
              </kbd>
            </label>

            {presentCategories.length > 0 && (
              <div
                role="group"
                aria-label="Filter by category"
                className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
              >
                <button
                  onClick={() => setCategory(null)}
                  aria-pressed={category === null}
                  className={`h-9 flex-none rounded-full px-3.5 text-sm font-semibold ${
                    category === null
                      ? "bg-foreground text-white"
                      : "border border-line-strong bg-surface text-foreground"
                  }`}
                >
                  All
                </button>
                {presentCategories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(category === c ? null : c)}
                    aria-pressed={category === c}
                    data-category={categorySlug(c)}
                    className={`h-9 flex-none rounded-full px-3.5 text-sm font-semibold ${
                      category === c ? "outline-2 outline-offset-2 outline-foreground" : ""
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3 text-base font-medium text-danger"
              >
                {error}
              </p>
            )}

            {showTrending && (
              <>
                <h3 className="mt-6 font-heading text-lg font-bold">Trending</h3>
                <ul className="mt-2.5 flex flex-col gap-2.5">
                  {trending.map((s, i) => renderCard(s, i + 1))}
                </ul>
              </>
            )}

            <h3 className="mt-6 font-heading text-lg font-bold">{listTitle}</h3>
            <ul className="mt-2.5 flex flex-col gap-2.5">
              {loading && <li className="rounded-[20px] bg-surface p-4 text-muted">Loading…</li>}
              {!loading && visible.length === 0 && (
                <li className="rounded-[20px] bg-surface p-4 text-muted">
                  {searching
                    ? "No matches yet. Be the first to post it!"
                    : category
                      ? "Nothing in this category yet."
                      : "No ideas yet. Be the first!"}
                </li>
              )}
              {rest.map((s) => renderCard(s))}
            </ul>
          </section>
        </div>

        {/* Floating post button, always in thumb reach */}
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-10 flex justify-center">
          <button
            onClick={openComposer}
            aria-haspopup="dialog"
            className="pointer-events-auto inline-flex h-14 items-center gap-2 rounded-full bg-foreground px-7 text-[17px] font-bold text-white hover:bg-[#2c2450]"
          >
            <PlusIcon className="size-5 text-sun" />
            Post an idea
          </button>
        </div>

        {/* Post sheet (native modal dialog) */}
        <dialog
          ref={dialogRef}
          aria-labelledby="post-title"
          onClose={() => composerOpen && closeComposer()}
          onClick={(e) => e.target === e.currentTarget && closeComposer()}
          className="theme-v4-sheet font-body"
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 pt-2.5 pb-7">
            <div aria-hidden className="mx-auto h-[5px] w-11 rounded-full bg-line sm:hidden" />
            <div className="flex items-center justify-between">
              <h2 id="post-title" className="font-heading text-[26px] font-extrabold tracking-[-0.02em]">
                Share an idea
              </h2>
              <button
                type="button"
                onClick={closeComposer}
                aria-label="Close"
                className="flex size-10 items-center justify-center rounded-full bg-[#f2efff] hover:bg-accent-soft"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="size-[18px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-[15px] font-semibold">What should change at school?</span>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  // Editing the draft makes any earlier match stale.
                  setDuplicate(null);
                }}
                maxLength={MAX_LENGTH}
                rows={3}
                aria-describedby="post-help"
                className="w-full resize-none rounded-[18px] border-2 border-line-strong p-3.5 text-[17px] leading-relaxed outline-none focus:border-accent"
              />
              <span id="post-help" className="flex justify-between text-[13px] text-muted">
                <span>Be specific: what, where, and why.</span>
                <span>
                  {text.length} / {MAX_LENGTH}
                </span>
              </span>
            </label>

            {duplicate && (
              <div role="alert" className="flex flex-col gap-3 rounded-[20px] bg-sun-soft px-4 py-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="flex size-8 flex-none items-center justify-center rounded-[10px] bg-sun">
                    <svg
                      aria-hidden
                      viewBox="0 0 24 24"
                      className="size-[18px]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                    >
                      <path d="M12 8v5M12 16.5v.5" />
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-[15px] font-bold">Someone already said something similar</p>
                    <p className="mt-0.5 text-sm text-muted">
                      Adding your vote helps it more than a new post.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-surface p-3">
                  <span className="flex h-[52px] w-[46px] flex-none flex-col items-center justify-center rounded-[14px] bg-accent-soft text-[15px] font-bold text-[#3c27b8]">
                    <Chevron className="size-[18px]" />
                    {duplicate.votes}
                    <span className="sr-only"> votes</span>
                  </span>
                  <span className="text-[15px] leading-snug font-semibold break-words">
                    {duplicate.text}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {voted.has(duplicate.id) ? (
                    <span className="flex h-12 items-center justify-center rounded-[14px] bg-surface px-2 text-center text-sm font-semibold text-muted">
                      You already upvoted it
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => upvoteInstead(duplicate)}
                      className="h-12 rounded-[14px] bg-accent text-[15px] font-bold text-on-accent hover:bg-accent-hover"
                    >
                      Upvote theirs
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => submit(true)}
                    disabled={submitting}
                    className="h-12 rounded-[14px] border-[1.5px] border-line-strong bg-surface text-[15px] font-semibold disabled:opacity-40"
                  >
                    {submitting ? "Posting…" : "Post mine anyway"}
                  </button>
                </div>
              </div>
            )}

            {error && composerOpen && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !text.trim()}
              className="h-14 rounded-[18px] bg-foreground text-[17px] font-bold text-white hover:bg-[#2c2450] disabled:opacity-40"
            >
              {submitting ? "Posting…" : "Post anonymously"}
            </button>
          </form>
        </dialog>

        {/* Toast region is always mounted so screen readers announce new
            messages. Sits above the floating post button. */}
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-4"
        >
          {toast && (
            <p
              key={toast.id}
              data-leaving={toast.leaving}
              className="toast max-w-sm rounded-2xl bg-toast px-5 py-3 text-[15px] font-semibold text-white"
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
