# School Feedback

Students scan a QR code, post anonymous feedback about their school, and upvote the ideas they agree with. Staff get a ranked view of what students want most, so student feedback stops disappearing into a suggestion box.

Built for the Congressional App Challenge (CA-14).

**Live app:** https://cc-app-ecru.vercel.app  
**Staff dashboard:** https://cc-app-ecru.vercel.app/staff

## What it does

- **Submit:** anonymous, with no login, so students actually use it.
- **Search first:** before posting, students can search existing feedback and upvote a match instead of adding a duplicate.
- **Duplicate check:** if a new post looks like an existing one, the app shows the match and offers "upvote it instead". The student can still post their own.
- **Upvote:** one vote per item per device. The author's own post counts as their vote.
- **Staff dashboard:** feedback ranked by votes, with search, a time-range filter (7 days / 30 days / all time), and newest-first sorting.

## Stack

- **Next.js** (App Router, TypeScript, Tailwind CSS): the UI plus server API routes in one project
- **Supabase** (Postgres): the database
- **Vercel**: hosting

## How it works

**Secrets stay on the server.** The browser only talks to the app's own API routes (`app/api/*`). Those routes reach the database with a server-only key. `lib/supabase.ts` imports `server-only`, so if client code ever imported it, the build would fail instead of shipping the key to browsers.

**Voting can't lose votes.** A simple "read the count, write count + 1" loses votes when two students tap at the same moment: both read 5, both write 6. `POST /api/vote` uses compare-and-swap instead. It writes the new count only if the count is still the value it just read (`UPDATE … WHERE votes = <old>`). If someone else voted first, the write matches nothing and the route retries after a short random delay. In testing, 20 votes sent at once all counted.

**One vote per device, no accounts.** Voted items are remembered in the browser's `localStorage`. That's not tamper-proof (clearing browser data resets it), but it stops casual double-voting without making students log in.

**Search.** `GET /api/submissions?q=…` does a case-insensitive `ILIKE` match in Postgres. `%` and `_` are escaped, so a search for "100%" means the literal text and doesn't act as a wildcard. The search box waits for a pause in typing and cancels the previous request, so an older, slower response can't replace newer results.

**Duplicate check.** Before inserting, `POST /api/submit` compares the new post's keywords with every existing post (`lib/dedup.ts`). It lowercases the text, strips punctuation, drops filler words ("the", "please", "really"…) and folds word forms ("towels" → "towel", "dropping" → "drop"). The score is shared keywords ÷ keywords in the *shorter* post, so a short post can still match a detailed one. A match needs at least 50% overlap **and** at least 2 shared keywords, so "wifi is bad" doesn't match every wifi post on one word. On a match, nothing is inserted; the student sees the existing post and can upvote it or post anyway. If the check itself fails, the post goes through normally, so it can never block a submission.

## Run locally

Requires Node.js 20+ and a Supabase project.

1. Create the tables. The schema is in [`CLAUDE.md`](CLAUDE.md#database-schema-already-applied-in-supabase). Then grant the server role access in the Supabase SQL editor:
   ```sql
   grant usage on schema public to service_role;
   grant select, insert, update, delete on public.submissions, public.themes to service_role;
   ```
2. Create `.env.local`:
   ```
   SUPABASE_URL=https://<your-project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
   ```
   Use the **secret** key, not the publishable one.
3. Install and run:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000 (students) and http://localhost:3000/staff (staff).

## Limitations and next steps

- The staff dashboard isn't password-protected yet. It shows only what the public page already shows; real staff login is planned.
- The duplicate check matches keywords, not meaning: "the fountains are gross" and "we need clean drinking water" share no words, so they won't match. Planned: meaning-based duplicate detection with text embeddings, and automatic grouping of feedback by theme.
