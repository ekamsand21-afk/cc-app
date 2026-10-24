import { supabase } from "@/lib/supabase";

const MAX_LENGTH = 500;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!text) {
    return Response.json({ error: "Feedback can't be empty." }, { status: 400 });
  }
  if (text.length > MAX_LENGTH) {
    return Response.json(
      { error: `Keep it under ${MAX_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("submissions")
    .insert({ text })
    .select("id, text, votes, created_at")
    .single();

  if (error) {
    console.error("submit failed", error);
    return Response.json({ error: "Could not save feedback." }, { status: 500 });
  }
  return Response.json(data, { status: 201 });
}
