import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (genAI) return genAI;
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Missing GEMINI_API_KEY in .env.local");
  }
  genAI = new GoogleGenerativeAI(key);
  return genAI;
}

// Free-tier model. Flash supports JSON mode + vision.
// gemini-1.5-flash was deprecated in late 2025 and removed from v1beta;
// gemini-2.5-flash is the current best price/performance model.
export const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

export function getGeminiModel() {
  return getClient().getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.4,
    },
  });
}

// ---------------------------------------------------------------------------
// Rate-limit / overload aware retries
// ---------------------------------------------------------------------------
//
// Gemini's free tier rejects bursts with HTTP 429 and can return HTTP 503 when
// the model is overloaded. The SDK throws an Error whose .message contains the
// status code and (for 429) a JSON error body with a retryDelay. We surface a
// structured `GeminiRetryError` so route handlers can return a clean HTTP
// response to the client instead of leaking the raw SDK stack trace.

export type GeminiRetryCode = "RATE_LIMITED" | "MODEL_BUSY";

export class GeminiRetryError extends Error {
  code: GeminiRetryCode;
  status: number;
  retryAfterMs: number;
  constructor(code: GeminiRetryCode, status: number, retryAfterMs: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function parseGeminiError(err: unknown): {
  code: GeminiRetryCode | null;
  retryAfterMs: number;
  message: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  // The SDK embeds the status code in the message, e.g.
  //   "[GoogleGenerativeAI Error]: Error fetching from ... [429 Too Many Requests] ..."
  const is429 = /\b429\b|Too Many Requests|RESOURCE_EXHAUSTED/i.test(message);
  const is503 =
    /\b503\b|Service Unavailable|UNAVAILABLE|overloaded|currently experiencing/i.test(
      message,
    );

  // Try to pull retryDelay from the embedded JSON body, e.g. "retryDelay":"32s".
  let retryAfterMs = 0;
  const retryMatch = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
  if (retryMatch) {
    retryAfterMs = Math.round(parseFloat(retryMatch[1]) * 1000);
  }

  if (is429) return { code: "RATE_LIMITED", retryAfterMs, message };
  if (is503) return { code: "MODEL_BUSY", retryAfterMs, message };
  return { code: null, retryAfterMs: 0, message };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Runs the given Gemini call with bounded retries on 429 / 503. The client
// can keep sending requests; we transparently absorb short outages. If we
// still can't recover, we throw a GeminiRetryError so the route can convert
// it to a structured HTTP response.
export async function runGeminiWithRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1500;

  let lastInfo: { code: GeminiRetryCode | null; retryAfterMs: number; message: string } = {
    code: null,
    retryAfterMs: 0,
    message: "",
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const info = parseGeminiError(err);
      lastInfo = info;
      if (!info.code) throw err; // not a retryable Gemini error

      if (attempt === maxAttempts) break;

      // Prefer Gemini's own retryDelay if present; otherwise exponential
      // backoff with jitter, capped at 20s.
      const backoff = Math.min(
        20_000,
        info.retryAfterMs || baseDelayMs * 2 ** (attempt - 1),
      );
      const jitter = Math.floor(Math.random() * 400);
      await sleep(backoff + jitter);
    }
  }

  const status = lastInfo.code === "RATE_LIMITED" ? 429 : 503;
  const friendly =
    lastInfo.code === "RATE_LIMITED"
      ? "Gemini free-tier quota hit. Please wait a moment and try again."
      : "Gemini is overloaded right now. Please try again in a few seconds.";
  throw new GeminiRetryError(
    lastInfo.code!,
    status,
    lastInfo.retryAfterMs,
    friendly,
  );
}

// Convert a GeminiRetryError into the JSON body and status code we want the
// client to see. Falls through to null if it isn't one of ours.
export function geminiRetryToResponse(
  err: unknown,
): { status: number; body: Record<string, unknown> } | null {
  if (!(err instanceof GeminiRetryError)) return null;
  return {
    status: err.status,
    body: {
      error: err.message,
      code: err.code,
      retryAfterMs: err.retryAfterMs || undefined,
    },
  };
}

// Strips ```json fences if the model ignored responseMimeType.
export function safeParseJSON<T>(raw: string): T | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to extract the first {...} or [...] block.
    const match = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}
