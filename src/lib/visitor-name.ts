// Self-reported visitor display name, captured on the first-ever visit and
// stored on the existing visitors row server-side. We also cache the value
// in localStorage so the first-visit dialog never re-fires for the same
// browser.
//
// IMPORTANT: this is purely cosmetic / admin-facing. The app never reads or
// displays the name to users. If a user clears localStorage they may see
// the prompt again — that's fine because the server-side RPC refuses to
// overwrite an existing name, so the operator's table view stays stable.

// Letters (any Unicode script) plus single spaces between words. The regex
// is intentionally generous about non-Latin alphabets so users with names
// in Devanagari, Cyrillic, Hangul, etc. aren't shut out. We exclude digits,
// punctuation, emojis, and any control characters.
//
// Validation rules (kept in sync between client and server):
//   - Min length: 2 (after trimming)
//   - Max length: 30
//   - Allowed: \p{L} (Unicode letters) + single ASCII space
//   - Leading/trailing whitespace is trimmed
//   - Consecutive spaces are collapsed to one
const NAME_ALLOWED_RE = /^\p{L}+(?: \p{L}+)*$/u;
const NAME_MIN = 2;
const NAME_MAX = 30;

export type SanitizedVisitorName =
  | { ok: true; value: string }
  | { ok: false; reason: string };

/**
 * Strict alphabet-only validator used by both the client form and the
 * server route. Returning the sanitized (trimmed, collapsed-whitespace)
 * value means the caller doesn't have to re-process the input.
 */
export function sanitizeVisitorName(raw: unknown): SanitizedVisitorName {
  if (typeof raw !== "string") {
    return { ok: false, reason: "Name is required." };
  }
  const collapsed = raw.trim().replace(/\s+/g, " ");
  if (collapsed.length === 0) {
    return { ok: false, reason: "Name is required." };
  }
  if (collapsed.length < NAME_MIN) {
    return {
      ok: false,
      reason: `Name must be at least ${NAME_MIN} characters.`,
    };
  }
  if (collapsed.length > NAME_MAX) {
    return {
      ok: false,
      reason: `Name must be at most ${NAME_MAX} characters.`,
    };
  }
  if (!NAME_ALLOWED_RE.test(collapsed)) {
    return {
      ok: false,
      reason: "Letters only — no numbers, punctuation, or symbols.",
    };
  }
  return { ok: true, value: collapsed };
}

const STORAGE_KEY = "fitcheck_visitor_name";

export function getStoredVisitorName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const result = sanitizeVisitorName(raw);
    return result.ok ? result.value : null;
  } catch {
    return null;
  }
}

export function setStoredVisitorName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Private mode / disabled storage — worst case the dialog re-fires.
  }
}

export const VISITOR_NAME_LIMITS = {
  min: NAME_MIN,
  max: NAME_MAX,
} as const;
