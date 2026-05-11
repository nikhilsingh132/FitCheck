import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

// Pull a useful message out of any thrown value (Error, Supabase PostgrestError,
// plain object, etc.) and always log the full thing server-side.
export function describeError(err: unknown): {
  message: string;
  details?: unknown;
} {
  if (err instanceof Error) {
    return { message: err.message };
  }
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    const message =
      (typeof e.message === "string" && e.message) ||
      (typeof e.error === "string" && e.error) ||
      (typeof e.details === "string" && e.details) ||
      (typeof e.hint === "string" && e.hint) ||
      JSON.stringify(e);
    return { message, details: e };
  }
  return { message: String(err) };
}

// ----- log hygiene helpers (F10) -----
//
// Logs flow into Vercel / your hosting provider's log retention, which is
// often viewable by more people than your DB. We don't want raw device IDs
// (the de-facto credential for anonymous users) or megabytes of attacker-
// supplied text in there.

const UUID_RE_G =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

// Stable but non-reversible representation of a UUID. We use SHA-256 truncated
// to 10 hex chars: still enough entropy to recognize "same device hit us
// twice" while being useless if logs are leaked.
function hashUuid(uuid: string): string {
  return `dev_${createHash("sha256").update(uuid).digest("hex").slice(0, 10)}`;
}

// Strip CR/LF/ANSI escape sequences so attackers can't forge fake log lines
// by stuffing "\n[INFO] admin login OK" into a sanitized text field.
function stripLogControlChars(value: string): string {
  return value
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "") // ANSI escapes
    .replace(/[\r\n\t]+/g, " "); // line breaks / tabs
}

// Truncate to a sane length so one bad request can't fill our log quota.
function truncate(value: string, max = 200): string {
  return value.length <= max ? value : `${value.slice(0, max)}…(${value.length - max} more)`;
}

export function scrubForLog(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return truncate(stripLogControlChars(value.replace(UUID_RE_G, (m) => hashUuid(m))));
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => scrubForLog(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (count++ >= 30) {
        out["__truncated"] = true;
        break;
      }
      out[k] = scrubForLog(v, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 100);
}

// Generic "something went wrong" we hand back to clients on unexpected
// failures. We deliberately don't echo the internal error message — it can
// leak env-var names, schema info, or stack-trace-y SDK strings to attackers.
const GENERIC_500_MESSAGE = "Something went wrong. Please try again.";

// Use this for unexpected server-side failures (uncaught throws, DB errors,
// SDK explosions). It logs the full thing server-side but returns a clean,
// generic message to the client.
//
// For client-input errors (400/404/422 etc.) build the NextResponse with the
// specific message inline; THIS helper is only for the catch-all.
export function jsonError(
  err: unknown,
  status = 500,
  context?: string,
): NextResponse {
  const { message, details } = describeError(err);
  // Scrub device IDs, truncate long strings, and strip newline/ANSI injection
  // before anything reaches the log sink.
  console.error(
    `[API error]${context ? ` ${context}:` : ""}`,
    scrubForLog(message),
    scrubForLog(details ?? err),
  );
  // In development we keep returning the real message so debugging stays
  // pleasant; in production we never leak internals.
  const isDev = process.env.NODE_ENV !== "production";
  const body = isDev
    ? { error: message, ...(details ? { details } : {}) }
    : { error: GENERIC_500_MESSAGE };
  return NextResponse.json(body, { status });
}
