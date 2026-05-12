// Server-side metadata. Image bytes live in the user's IndexedDB, keyed by id.
export type WardrobeItem = {
  id: string;
  created_at: string;
  user_id: string;
  category: string | null;
  color: string | null;
  style: string | null;
  material: string | null;
  vibe: string | null;
};

export type AnalyzedTags = {
  category: string;
  color: string;
  style: string;
  material: string;
  vibe: string;
};

export type OutfitSuggestion = {
  item_ids: string[];
  reasoning: string;
  vibe: string;
};

// Per-day outfit history. Image bytes still live in IndexedDB on the
// originating device; on /history we hydrate each `item_ids` entry from the
// current wardrobe list, so deletions degrade gracefully (missing items just
// drop out of the rendered outfit instead of breaking it).
export type OutfitSource = "dress-me" | "match";

export type OutfitRecord = {
  id: string;
  created_at: string;
  user_id: string;
  source: OutfitSource;
  occasion: string | null;
  vibe: string | null;
  reasoning: string | null;
  item_ids: string[];
};
