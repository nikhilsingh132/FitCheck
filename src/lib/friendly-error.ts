// Boils raw Gemini / network errors down to a short human sentence.
// The Gemini SDK error messages include the full request URL and metadata
// which is overwhelming to render in a small card or toast.
export function friendlyError(raw: string | undefined): string {
  if (!raw) return "Something went wrong";
  if (/429|Too Many Requests|RESOURCE_EXHAUSTED|quota/i.test(raw)) {
    return "Gemini free-tier quota hit. Please wait a moment and try again.";
  }
  if (/503|Service Unavailable|overloaded|UNAVAILABLE/i.test(raw)) {
    return "Gemini is overloaded right now. Please try again in a few seconds.";
  }
  if (/network|fetch|ECONN|ETIMEDOUT/i.test(raw)) {
    return "Network error. Check your connection and try again.";
  }
  return raw.length > 180 ? raw.slice(0, 180).trim() + "…" : raw;
}
