import { supabase } from "@/lib/supabase";

const MAX_ATTEMPTS = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Increment votes without a lost-update race. supabase-js can't express
// `votes = votes + 1`, so we read the current count and only write if it
// hasn't changed since (compare-and-swap). If two students vote at the same
// instant, one write matches zero rows and simply retries with the fresh count.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid submission id." }, { status: 400 });
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: current, error: readError } = await supabase
      .from("submissions")
      .select("votes")
      .eq("id", id)
      .maybeSingle();

    if (readError) {
      console.error("vote read failed", readError);
      return Response.json({ error: "Could not record vote." }, { status: 500 });
    }
    if (!current) {
      return Response.json({ error: "Submission not found." }, { status: 404 });
    }

    const { data: updated, error: writeError } = await supabase
      .from("submissions")
      .update({ votes: current.votes + 1 })
      .eq("id", id)
      .eq("votes", current.votes)
      .select("id, votes");

    if (writeError) {
      console.error("vote write failed", writeError);
      return Response.json({ error: "Could not record vote." }, { status: 500 });
    }
    if (updated.length === 1) {
      return Response.json(updated[0]);
    }
    // Lost the race. Wait a random beat so colliding retries spread out.
    await new Promise((r) => setTimeout(r, Math.random() * 50 * (attempt + 1)));
  }

  return Response.json({ error: "Too busy, try again." }, { status: 503 });
}
