# School Feedback

Students scan a QR code, post anonymous feedback about their school, and upvote the ideas they agree with. Staff get a ranked view of what students want most, so student feedback stops disappearing into a suggestion box.

Built for the Congressional App Challenge (CA-14).

**Live app:** https://cc-app-ecru.vercel.app  
**Staff dashboard:** https://cc-app-ecru.vercel.app/staff

## What it does

- **Submit:** anonymous, with no login, so students actually use it.
- **Search first:** before posting, students can search existing feedback and upvote a match instead of adding a duplicate.
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
- Planned: AI-powered duplicate detection (match new posts against existing ones by meaning, not just keywords) and automatic grouping of feedback by theme.
