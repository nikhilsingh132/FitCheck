import type { WardrobeItem } from "@/lib/types";

// We persist the last-generated outfit to sessionStorage so we can navigate
// to a dedicated /outfit screen after the styling loader completes. Storage
// is per-tab and tiny (no image bytes — those live in IndexedDB and are
// fetched per-item by id via useLocalImage).

const STORAGE_KEY = "fitcheck_latest_outfit";

export type StoredOutfit = {
  items: WardrobeItem[];
  reasoning?: string;
  vibe?: string;
  title?: string;
  // Context needed to re-roll the outfit from the /outfit screen without
  // sending the user back to the form. `source` decides which API to call
  // and which seed payload to send.
  source?: "dress-me" | "match";
  // For Dress Me reshuffles.
  occasion?: string;
  // For Match reshuffles — the user's originally pinned 1–2 item ids that
  // MUST stay in every regenerated outfit.
  seedIds?: string[];
};

export function writeLatestOutfit(outfit: StoredOutfit): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(outfit));
  } catch {
    // Quota errors are non-fatal — the result page will show the empty state.
  }
}

export function readLatestOutfit(): StoredOutfit | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredOutfit;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLatestOutfit(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
