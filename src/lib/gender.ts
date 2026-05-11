// Lightweight per-browser styling preference. We never store this server-side
// (no DB column) — it's purely a hint we attach to Gemini prompts so the
// generated outfits, vibe labels, and style tags lean the right way.
//
// Trade-offs:
//   - Clearing browser storage = preference resets, user is re-asked on next
//     visit.
//   - Same browser shared by multiple people = one preference at a time. Good
//     enough for a free anonymous app; if we ever add real auth we can move
//     this onto the user row.

export type GenderPref = "men" | "women" | "unisex";

export const GENDER_OPTIONS: { value: GenderPref; label: string }[] = [
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
  { value: "unisex", label: "Unisex / Both" },
];

const STORAGE_KEY = "fitcheck_gender_pref";

/** Header used to relay the preference to API routes. */
export const GENDER_HEADER = "x-fitcheck-gender";

/** Returns the stored preference or null if the user hasn't picked yet. */
export function getStoredGender(): GenderPref | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "men" || raw === "women" || raw === "unisex") return raw;
    return null;
  } catch {
    return null;
  }
}

export function setStoredGender(pref: GenderPref): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Private mode / storage disabled — nothing we can do; the next page load
    // will just re-ask. That's acceptable for a preference, not data.
  }
}

/**
 * Header-safe version of the preference. Used by the api-client wrapper so
 * server routes can read it via {@link readGenderHeader}.
 */
export function getGenderForHeader(): GenderPref | "" {
  return getStoredGender() ?? "";
}

/**
 * Server-side: extract the preference from a Request. Falls back to "unisex"
 * (no bias) so older clients without the header keep working.
 */
export function readGenderHeader(req: Request): GenderPref {
  const raw = req.headers.get(GENDER_HEADER)?.toLowerCase();
  if (raw === "men" || raw === "women" || raw === "unisex") return raw;
  return "unisex";
}

/**
 * Human-readable label used in Gemini prompts. Kept here so the wording is
 * consistent across /api/analyze, /api/dress-me, and /api/match.
 */
export function genderPromptLabel(pref: GenderPref): string {
  if (pref === "men") return "men's";
  if (pref === "women") return "women's";
  return "unisex";
}

/**
 * Short instruction block we splice into Gemini prompts so the model knows
 * which audience the output is for. Centralised so every route stays in sync
 * if we tweak the tone.
 */
export function genderInstruction(pref: GenderPref): string {
  if (pref === "unisex") {
    return `Style for any gender. Keep language gender-neutral.`;
  }
  const label = genderPromptLabel(pref);
  return `The user is styling ${label} fashion. Pick pieces, vibe words, and reasoning that are appropriate for ${label} wear.`;
}
