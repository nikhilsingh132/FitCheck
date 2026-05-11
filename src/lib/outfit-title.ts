// Small helper used by /dress-me and /outfit to build a tidy page title
// from a user-supplied occasion string. Kept in its own module so both
// the form page and the reshuffle path on the result page format the
// title identically.

const TRAILING_NOISE_RE =
  /\s+(outfit|outfits|look|looks|vibe|vibes)\s*$/i;

// We:
//   - strip trailing "outfit"/"look"/"vibe" so a user typing "meeting
//     outfit" doesn't end up with "Outfit for meeting outfit" (which
//     read awkwardly and wraps word-by-word on phones).
//   - capitalize the first letter.
//   - cap the visible occasion at 24 chars so the heading stays one
//     line on mobile. The full occasion is still sent to the API, so
//     this only affects display.
export function formatOutfitTitle(occasion: string): string {
  const trimmed = occasion.trim();
  let cleaned = trimmed.replace(TRAILING_NOISE_RE, "").trim();
  if (!cleaned) cleaned = trimmed;
  if (cleaned.length > 24) {
    cleaned = cleaned.slice(0, 23).trimEnd() + "…";
  }
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return `Outfit for ${cleaned}`;
}
