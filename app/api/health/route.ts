import { supabase } from "@/lib/supabase";

// Never serve this from a cache: the whole point is that every call reaches
// the database.
export const dynamic = "force-dynamic";

// GET /api/health
// A one-row read so Supabase sees activity. The free tier pauses a project
// after a week without any; .github/workflows/keepalive.yml calls this daily.
// Returns no row data, just whether the read worked.
export async function GET() {
  const { error } = await supabase.from("submissions").select("id").limit(1);
  if (error) {
    console.error("health check failed", error);
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true, at: new Date().toISOString() });
}
