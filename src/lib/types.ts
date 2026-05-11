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
