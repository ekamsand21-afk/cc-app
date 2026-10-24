import { supabase } from "@/lib/supabase";

const MAX_QUERY = 100;

// `%` and `_` are wildcards in ILIKE; escape them (and the escape char) so a
// search for "100%" means the literal text, not "100 followed by anything".
function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// GET /api/submissions?q=lunch&sort=top|new&days=7
// Default: ranked by votes, newest breaks ties.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, MAX_QUERY);
  const sort = params.get("sort") === "new" ? "new" : "top";
  const days = Number(params.get("days"));

  let query = supabase.from("submissions").select("id, text, votes, created_at");

  if (q) {
    query = query.ilike("text", `%${escapeLike(q)}%`);
  }
  if (Number.isInteger(days) && days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    query = query.gte("created_at", since.toISOString());
  }
  if (sort === "top") {
    query = query.order("votes", { ascending: false });
  }
  query = query.order("created_at", { ascending: false }).limit(500);

  const { data, error } = await query;
  if (error) {
    console.error("list failed", error);
    return Response.json({ error: "Could not load feedback." }, { status: 500 });
  }
  return Response.json(data);
}
