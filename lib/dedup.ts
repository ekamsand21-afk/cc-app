// Keyword-overlap duplicate check. Pure functions, no I/O, so it's easy to test.
//
// Score = shared significant words / significant words in the SHORTER text.
// Using the shorter text means "gym bathrooms have no soap" still matches a
// longer, more detailed post about the same thing.
//
// Tuning:
// - DUPLICATE_THRESHOLD: raise (e.g. 0.6) if unrelated posts get flagged;
//   lower (e.g. 0.4) if obvious rewordings slip through.
// - MIN_SHARED_WORDS: stops tiny posts from matching on a single word
//   ("wifi is bad" vs any wifi post would otherwise score 1/2 = 50%).
// - STOPWORDS: add words that show up everywhere in your school's feedback
//   and carry no topic (e.g. "school", "need") so they can't create matches.
export const DUPLICATE_THRESHOLD = 0.5;
export const MIN_SHARED_WORDS = 2;

const STOPWORDS = new Set(
  (
    "a about above after again against all almost also always am an and any are " +
    "around as at be because been before being below between both but by can cant " +
    "could did didnt do does doesnt doing dont down during each even ever every " +
    "few for from get gets getting go goes going got had has have having he her " +
    "here hers him his how i id if im in into is isnt it its ive just keep know " +
    "less let lets like lot lots make many maybe me more most much must my need " +
    "needs never no nor not now of off often on once one only or other our ours " +
    "out over own please pretty really same see should so some still such than " +
    "thank thanks that thats the their theirs them then there theres these they " +
    "theyre thing things think this those through to too under until up us use " +
    "very want wants was we were weve what whats when where which while who why " +
    "will with would wouldnt yall yet you your youre school students student"
  ).split(" "),
);

// Tiny stemmer so word forms line up: "towels"/"towel", "classes"/"class",
// "drops"/"dropping"/"drop". Deliberately minimal; it only has to make the
// same word match itself, not produce real dictionary roots.
function stem(word: string) {
  if (word.endsWith("sses")) return word.slice(0, -2); // classes -> class
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y"; // activities -> activity
  if (word.length > 5 && word.endsWith("ing")) {
    const base = word.slice(0, -3);
    // Undouble: dropping -> dropp -> drop, running -> run
    return /([b-df-hj-np-tv-z])\1$/.test(base) ? base.slice(0, -1) : base;
  }
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function significantWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/['’]/g, "") // "there's" -> "theres", so it hits the stopword list
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem)
    // Check again after stemming: "keeps" -> "keep", "things" -> "thing".
    .filter((w) => !STOPWORDS.has(w));
  return new Set(words);
}

export type Match<T> = { item: T; score: number; shared: string[] };

export function findDuplicate<T extends { text: string; votes: number }>(
  text: string,
  existing: T[],
): Match<T> | null {
  const words = significantWords(text);
  if (words.size === 0) return null;

  let best: Match<T> | null = null;
  for (const item of existing) {
    const other = significantWords(item.text);
    if (other.size === 0) continue;
    const shared = [...words].filter((w) => other.has(w));
    if (shared.length < MIN_SHARED_WORDS) continue;
    const score = shared.length / Math.min(words.size, other.size);
    if (score < DUPLICATE_THRESHOLD) continue;
    // Prefer the closest match; on a tie, the more-voted item.
    if (!best || score > best.score || (score === best.score && item.votes > best.item.votes)) {
      best = { item, score, shared };
    }
  }
  return best;
}
