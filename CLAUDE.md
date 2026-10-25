# cc-app — Congressional App Challenge build brief

## What this is
A **student-feedback web app**. Students scan a QR code, submit feedback/complaints/suggestions about their school, browse existing submissions, and upvote ones they agree with. School staff (principal, counselors) see a dashboard that ranks the feedback so they can see what students actually want.

This is an entry for the **Congressional App Challenge (CA-14)**. Two-person team: one developer (directs the code), one designer (owns visual/UI). **Hard deadline: Monday Oct 26, 6:00 PM PT.** It is Saturday afternoon. Optimize every decision for *a real, working, honest, demoable app by Sunday night*, not for completeness or polish beyond that.

## Non-negotiable constraints (read first)
- **The app must genuinely work.** CAC judges may request access to the working app and source code to verify the demo video is real; failure to produce it is disqualifying. Do not stub, fake, or mock functionality to "look" done. Every feature shown in the demo must actually run.
- **Scope is the enemy.** Build *school feedback only*. The "QR codes for many purposes / master feedback platform" idea is a one-line future-vision for the pitch, NOT code. Do not build multi-tenant, multi-purpose, or generalized anything.
- **No student login.** Friction kills participation and auth is scope risk. Students submit and vote anonymously. Prevent double-voting per device with `localStorage`, which is good enough for school scope and the demo.
- **Secrets stay server-side.** The Supabase service-role key and any model API key are used only in server routes (`app/api/.../route.ts`), never in client components.

## Stack
- **Next.js (App Router, TypeScript, Tailwind)** — UI + serverless API routes in one project, deployed to **Vercel**.
- **Supabase (Postgres + pgvector)** — database; also provides auth if needed later.
- Everything runs locally via `npm run dev` during the build; deploy to Vercel for the live demo URL.

## Current state (as of Sat Oct 24)
- **MVP steps 1–5 are built and live** at https://cc-app-ecru.vercel.app (staff view at `/staff`; Vercel project `ekam-sandhu/cc-app`), verified end-to-end on mobile width. Next up: step 6 design pass + QR.
- **Source:** public repo https://github.com/ekamsand21-afk/cc-app (`main` tracks `origin/main`). Commits use the GitHub no-reply email set in this repo's git config. Pushing does **not** deploy — Vercel isn't connected to the repo.
- Next.js 16 (App Router, TS, Tailwind, no `src/`). This Next version differs from older docs — check `node_modules/next/dist/docs/` before using unfamiliar APIs (see AGENTS.md).
- Code map:
  - `lib/supabase.ts` — service-role client, guarded by `import "server-only"` so a client import fails the build.
  - `app/api/submit/route.ts` — POST `{ text, force? }`, trimmed, 1–500 chars, inserts with `votes = 1`. Unless `force === true`, first runs the keyword duplicate check; on a match returns `200 { duplicate, score }` and inserts nothing. Check fails open (DB error → insert normally).
  - `lib/dedup.ts` — keyword-overlap matcher (pure, no I/O). Score = shared significant words ÷ words in the shorter text; match needs ≥ `DUPLICATE_THRESHOLD` (0.5) **and** ≥ `MIN_SHARED_WORDS` (2). Tune those two constants or `STOPWORDS`. Separate from the embedding/`match_submission` stretch path, which is untouched.
  - `app/api/submissions/route.ts` — GET, ranked by `votes` desc, `created_at` desc. Optional `q` (ILIKE, `%`/`_` escaped), `sort=top|new`, `days=N`. Limit 500.
  - `app/api/vote/route.ts` — POST `{ id }`. supabase-js can't do `votes = votes + 1`, so it does compare-and-swap (`update … where votes = <read value>`) with up to 10 jittered retries. Tested: 20 concurrent votes, zero lost.
  - `app/page.tsx` — student page (client component): submit form with "looks like an existing idea" prompt (Upvote it instead / Submit mine anyway / Edit), debounced search (aborts stale requests), ranked list, upvote. Voted ids stored in `localStorage` key `voted-submissions`; the author's own submission counts as their vote.
  - `app/staff/page.tsx` (server, sets `noindex` metadata) → `StaffDashboard.tsx` (client): stats, search, time range, sort. Unlisted, not protected. Don't add a `staff/layout.tsx` — a second layout breaks Next 16's generated `LayoutProps` type check against the root layout.
  - `lib/types.ts` — shared `Submission` type (safe for client import).
  - `app/globals.css` — **color tokens, the single source of truth** (Tailwind v4 `@theme`): `background`, `surface`, `foreground`, `muted`, `line`, `line-strong`, `accent`, `accent-hover`, `accent-text`, `accent-soft`, `on-accent`, `danger`, `success` → utilities like `bg-accent`, `text-muted`, `border-line`. **Dark theme** (bg #0F0F0F, cards #1A1A1A, text #EDEDED). The red has two tunings: `accent` #D63851 for fills/borders/rings (white text 4.6:1) and `accent-text` #EC5A72 for red text (5.2:1 on cards) — use `text-accent-text`, never `text-accent`, for red text. Use tokens, never raw colors or `opacity-*` for text. Accent is for primary buttons, vote counts and selected/active states only. All pairings pass WCAG AA.
- Env: `.env.local` (git-ignored) holds `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — this must be the **`sb_secret_…`** key, not `sb_publishable_…`. The same two vars are set in Vercel → Production.
- Supabase: schema below is applied. Tables created in the SQL editor needed explicit grants: `service_role` has select/insert/update/delete on `submissions` and `themes` plus execute on `match_submission`. **Never grant to `anon`** (RLS is off).
- Deploy is CLI-based from this folder (not git-triggered): `npx vercel@latest deploy --prod`. Vercel rejects CLI versions older than 47.2.2.
- The database is empty — test rows are prefixed `[TEST]` and deleted after verification.

## Database schema (already applied in Supabase)
```sql
create extension if not exists vector;

create table themes (
  id uuid primary key default gen_random_uuid(),
  label text not null
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  embedding vector(1536),          -- nullable; only used by the stretch dedup feature
  votes int not null default 1,    -- creator counts as the first vote
  theme_id uuid references themes(id),
  created_at timestamptz not null default now()
);

create or replace function match_submission(query_embedding vector(1536), match_count int)
returns table (id uuid, text text, votes int, distance float)
language sql stable as $$
  select id, text, votes, embedding <=> query_embedding as distance
  from submissions
  order by embedding <=> query_embedding
  limit match_count;
$$;
```
Note: RLS is intentionally OFF for now (all DB access goes through the server-side service-role key). **Before any public exposure beyond the demo, revisit RLS** — don't ship a publicly reachable direct-client DB connection without policies.

## Critical path (MVP — must ship)
Build in this order. Each step must leave the app runnable.
1. **Submit → store.** `POST /api/submit` inserts `{ text }` into `submissions` (embedding left null). Already stubbed — verify it writes a row.
2. **Browse + rank.** A public page lists submissions ordered by `votes` desc, newest as tiebreak.
3. **Upvote.** A `POST /api/vote` route increments `votes` for a submission id. Client prevents re-voting the same id from the same device via `localStorage`.
4. **Search.** Simple case-insensitive text search over `submissions.text` (SQL `ilike`) so students can find an existing item before adding a duplicate.
5. **Staff dashboard.** A separate route (e.g. `/staff`) showing the same data ranked, with filter/search. For the demo this can be an unlisted route; real auth is a stretch, not MVP.
6. **Design pass.** Designer applies Tailwind styling to both the student and staff views — clean, high-contrast, mobile-first. Generate a static QR code pointing at the deployed submit URL (trivial; it's just an image, not an engineering task).
7. **Deploy to Vercel** and confirm the live URL works end-to-end.

## Stretch (only if MVP is rock-solid — this is the technical "wow")
- **Semantic dedup.** On submit, embed the text (OpenAI `text-embedding-3-small`, 1536 dims — matches the schema), call `match_submission` for the nearest existing item, and if cosine distance < a tuned threshold (~0.15 starting point, calibrate on real examples), offer "this looks like an existing idea — upvote it?" instead of creating a duplicate. Requires `OPENAI_API_KEY` in `.env.local` and `npm install openai`. Embedding calls run server-side only.
- **Auto-theming.** A server pass sends current submissions to an LLM and tags each with a theme label; dashboard shows "% of feedback by theme."
Keep both OFF the critical path. If time runs out, the MVP is a complete, honest, working entry without them.

## The weekend timebox
- Sat afternoon→eve: MVP steps 1–3 live on Vercel (ugly but real).
- Sun morning: steps 4–5 (+ dedup only if spine is solid).
- Sun midday: step 6 design pass + QR.
- Sun afternoon/eve: record demo video (open on a real student whose feedback went nowhere → show the app solving it). Video is a first-class deliverable — judges score largely off it and may never run the app.
- Sun night: write the 5 short-answer submission fields + cover photo.
- Mon by ~2 PM: submit. Leave a 4-hour buffer before the 6 PM deadline.

## Submission form fields the project must support (for later, not code)
App name; languages used (JavaScript/TypeScript); platform (Web); public demo video URL (https, public); "what it does"; "what inspired it"; "technical difficulties faced"; "2.0 improvements"; AI-use disclosure (be honest — AI assistance is allowed and ~70% of last year's winners used it); cover photo (JPEG, 3:4, ~600×800); optional project/GitHub link.

## How to work with me (the developer)
- Architecture/blueprint first, then details. Phased, non-overlapping steps.
- Explain the *why* behind a mechanic, not just the keystrokes — I direct the build and need to understand it, especially to answer the "technical difficulties" question honestly.
- Push back plainly on anything that threatens correctness, the deadline, or the honesty constraints above. Don't expand scope unprompted.
