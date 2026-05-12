// Simple in-process rate limiter for the Gemini-backed API routes.
//
// We track two separate sliding windows per key (IP, device id):
//   - a short "burst" window (per minute) to stop curl loops / hot spammers
//   - a "day" window to cap the absolute damage one client can do
//
// Limitations to be aware of:
//   - State lives in this Node process. On serverless (Vercel) every cold-
//     start gets a fresh counter, and concurrent instances don't share.
//     For a hobby project this still catches 99% of casual abuse; swap to
//     Upstash Redis when scale matters.
//   - In-memory map can grow unbounded if many unique IPs hit you. We do
//     a lazy sweep on each call to evict expired buckets.

import { DEVICE_ID_HEADER } from "@/lib/device-id";

type Bucket = {
  // Timestamps (ms) of recent hits, kept sorted ascending. We trim entries
  // older than the longest window we care about (the day window).
  hits: number[];
};

const store = new Map<string, Bucket>();

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Defaults chosen so a real user hitting "Style my outfit" or "Complete the
// look" a few dozen times in a session is fine, but a script firing as fast
// as it can gets shut down inside the first minute.
export type RateLimitConfig = {
  perMinute: number;
  perDay: number;
};

export const DEFAULT_LIMITS = {
  // LLM routes — strictest because each call costs us Gemini quota / $.
  analyze: { perMinute: 10, perDay: 200 },
  match: { perMinute: 12, perDay: 150 },
  "dress-me": { perMinute: 12, perDay: 150 },

  // DB-only routes — much cheaper, but still need a ceiling so spammers
  // can't melt the DB or inflate counters.
  "wardrobe-read": { perMinute: 60, perDay: 5000 },
  "wardrobe-write": { perMinute: 30, perDay: 800 },
  "wardrobe-delete": { perMinute: 30, perDay: 500 },
  "outfits-read": { perMinute: 60, perDay: 2000 },
  "outfits-write": { perMinute: 30, perDay: 500 },
  "visitor-ping": { perMinute: 5, perDay: 50 },
} as const satisfies Record<string, RateLimitConfig>;

export type RateLimitRoute = keyof typeof DEFAULT_LIMITS;

export type RateLimitResult =
  | { ok: true }
  | {
      ok: false;
      // The window that tripped, for nicer error messages.
      reason: "burst" | "daily";
      retryAfterMs: number;
    };

// We rate-limit on two identifiers and take whichever is more restrictive:
//   1. IP address (cheap to obtain, hard to forge without a real proxy)
//   2. Device id from our header (lets us cap one browser even if it rotates
//      IPs, e.g. on mobile data)
// A determined attacker can rotate both, but that's a high enough bar to
// keep casual abuse out without adding real auth.
function extractIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    // First entry is the original client per RFC 7239 convention.
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

function extractDeviceId(req: Request): string {
  const raw = req.headers.get(DEVICE_ID_HEADER);
  return raw && raw.length <= 64 ? raw : "no-device";
}

function checkBucket(key: string, cfg: RateLimitConfig, now: number): RateLimitResult {
  const bucket = store.get(key) ?? { hits: [] };

  // Drop entries older than the daily window (the largest one we use).
  // This is cheap because the array is sorted by insertion time.
  const cutoffDay = now - DAY_MS;
  let dropTo = 0;
  while (dropTo < bucket.hits.length && bucket.hits[dropTo] < cutoffDay) {
    dropTo++;
  }
  if (dropTo > 0) bucket.hits.splice(0, dropTo);

  // Count hits inside each window.
  const cutoffMinute = now - MINUTE_MS;
  let minuteCount = 0;
  for (let i = bucket.hits.length - 1; i >= 0; i--) {
    if (bucket.hits[i] >= cutoffMinute) minuteCount++;
    else break;
  }
  const dayCount = bucket.hits.length;

  if (minuteCount >= cfg.perMinute) {
    // The oldest hit in the minute window tells us when one slot frees up.
    const oldestInMinute = bucket.hits[bucket.hits.length - minuteCount];
    return {
      ok: false,
      reason: "burst",
      retryAfterMs: Math.max(1000, oldestInMinute + MINUTE_MS - now),
    };
  }
  if (dayCount >= cfg.perDay) {
    const oldestInDay = bucket.hits[0];
    return {
      ok: false,
      reason: "daily",
      retryAfterMs: Math.max(1000, oldestInDay + DAY_MS - now),
    };
  }

  bucket.hits.push(now);
  store.set(key, bucket);
  return { ok: true };
}

// Public entry point. Returns ok:false the first time *either* identifier
// trips, so we don't double-charge clients who happen to share an IP (e.g.
// behind NAT) while still catching device rotation.
export type RateLimitOptions = {
  // For routes where device-id rotation is a useless defense (e.g. the
  // visitor counter, where an attacker WANTS new device IDs each call),
  // we can drop the device-id check and lean entirely on IP.
  ipOnly?: boolean;
};

export function checkRateLimit(
  req: Request,
  route: RateLimitRoute,
  opts: RateLimitOptions = {},
): RateLimitResult {
  const cfg = DEFAULT_LIMITS[route];
  const now = Date.now();
  const ip = extractIp(req);

  // Opportunistic cleanup so the map doesn't grow forever in long-lived
  // processes. We only do this every ~1% of calls to keep the hot path fast.
  if (Math.random() < 0.01) sweepExpired(now);

  const ipKey = `ip:${route}:${ip}`;
  const ipResult = checkBucket(ipKey, cfg, now);
  if (!ipResult.ok) return ipResult;

  if (opts.ipOnly) return ipResult;

  // Device gets the same cap as IP — one browser tab generating 150
  // outfits/day is already aggressive, and most NAT'd users share an IP
  // so we don't want IP-only to be the only knob.
  const device = extractDeviceId(req);
  const deviceKey = `dev:${route}:${device}`;
  return checkBucket(deviceKey, cfg, now);
}

function sweepExpired(now: number): void {
  const cutoff = now - DAY_MS;
  for (const [key, bucket] of store) {
    if (bucket.hits.length === 0 || bucket.hits[bucket.hits.length - 1] < cutoff) {
      store.delete(key);
    }
  }
}

// Translate a tripped limit into the response shape we already use for
// Gemini rate-limit errors (see geminiRetryToResponse). Reusing the same
// shape means the client's existing 429-handling kicks in for free.
export function rateLimitResponseBody(result: Extract<RateLimitResult, { ok: false }>) {
  return {
    error:
      result.reason === "burst"
        ? "Too many requests — please slow down for a moment."
        : "Daily limit reached for this app. Try again tomorrow.",
    code: "RATE_LIMITED" as const,
    retryAfterMs: result.retryAfterMs,
  };
}
