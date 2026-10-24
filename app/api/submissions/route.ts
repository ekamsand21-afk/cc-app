import { supabase } from "@/lib/supabase";

// Ranked list: most votes first, newest breaks ties.
export async function GET() {
  const { data, error } = await supabase
    .from("submissions")
    .select("id, text, votes, created_at")
    .order("votes", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("list failed", error);
    return Response.json({ error: "Could not load feedback." }, { status: 500 });
  }
  return Response.json(data);
}
