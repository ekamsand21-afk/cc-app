import { findDuplicate } from "@/lib/dedup";
import { supabase } from "@/lib/supabase";
import type { Submission } from "@/lib/types";

const MAX_LENGTH = 500;

// Returns the closest existing item if the new text looks like a duplicate.
// Fails open: if the lookup errors, we log it and let the submission through,
// so the duplicate check can never block a student from posting.
async function checkDuplicate(text: string) {
  const { data, error } = await supabase
    .from("submissions")
    .select("id, text, votes, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) {
    console.error("duplicate check failed, skipping", error);
    return null;
  }
  return findDuplicate<Submission>(text, data);
}

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

  // `force: true` means the student saw the suggested match and chose to post anyway.
  if (body?.force !== true) {
    const match = await checkDuplicate(text);
    if (match) {
      // Nothing inserted; the client offers "upvote it instead?"
      return Response.json({ duplicate: match.item, score: match.score });
    }
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
