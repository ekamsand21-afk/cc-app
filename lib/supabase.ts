import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS, so it must never reach the browser.
// The "server-only" import above turns any client-side import into a build error.
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

export type Submission = {
  id: string;
  text: string;
  votes: number;
  created_at: string;
};
