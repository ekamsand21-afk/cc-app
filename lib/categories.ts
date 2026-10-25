// design-v2 (experimental): display-only category tags.
//
// There is no category data in the database, so tags are derived from each
// idea's text with a plain keyword list — nothing is guessed by a model and
// nothing is written anywhere. The category with the most keyword hits wins;
// ties go to the one listed first (e.g. "gym at lunch" is 1–1, so Campus Life
// beats Food). No match → no tag.
//
// Revert: delete this file and the <CategoryTag> use in app/page.tsx.

const CATEGORIES: [label: string, keywords: string[]][] = [
  ["Wellbeing", ["stress", "stressed", "counseling", "counselor", "mental", "anxiety", "quiet room", "bullying"]],
  ["Tech", ["wifi", "wi-fi", "internet", "chromebook", "laptop", "charger", "charging"]],
  ["Getting Around", ["pickup", "drop-off", "bus", "commute", "parking", "start time", "traffic", "bike"]],
  ["Academics", ["library", "study", "finals", "exam", "test", "homework", "class", "teacher", "grade", "printer", "tutoring"]],
  ["Campus Life", ["gym", "club", "clubs", "dance", "homecoming", "event", "events", "sports", "seating", "shade", "shaded", "rally"]],
  ["Food", ["lunch", "cafeteria", "food", "pizza", "vegetarian", "vending", "snack", "snacks", "menu", "breakfast"]],
  ["Facilities", ["bathroom", "bathrooms", "soap", "paper towels", "locker", "lockers", "fountain", "fountains", "water", "lighting", "broken", "repair", "ac", "heat"]],
];

// Labels in display order (used for the filter chips).
export const CATEGORY_LABELS = CATEGORIES.map(([label]) => label);

export function categorySlug(label: string) {
  return label.toLowerCase().replace(/\s+/g, "-");
}

const MATCHERS = CATEGORIES.map(([label, words]) => ({
  label,
  // Whole words only, so "ac" doesn't match inside "practice".
  re: new RegExp(`\\b(${words.map((w) => w.replace(/[-]/g, "\\-")).join("|")})\\b`, "gi"),
}));

export function categoryFor(text: string): string | null {
  let best: string | null = null;
  let bestHits = 0;
  for (const { label, re } of MATCHERS) {
    const hits = text.match(re)?.length ?? 0;
    if (hits > bestHits) {
      best = label;
      bestHits = hits;
    }
  }
  return best;
}
