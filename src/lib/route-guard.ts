// Shared guard helpers for API routes.
//
// We centralize three checks so every route applies them consistently:
//   1. checkOrigin    — same-origin enforcement (kills curl/bot traffic in prod)
//   2. checkBodySize  — refuses oversized requests before req.json() parses them
//   3. (rate-limit lives in @/lib/rate-limit and is called separately so routes
//       can pick the right "bucket" name per-route)
//
// Errors are returned as a NextResponse so the calling route can `return` them
// directly. None of these helpers should ever throw.

import { NextResponse } from "next/server";

// In dev we let any origin through so localhost tooling (curl, REST clients,
// Postman, the Next dev fetcher) works. In prod we only accept requests that
// either originate from the same host (browser fetch) or carry no Origin at
// all (legitimate server-side fetches from our own code).
//
// We intentionally don't keep an "allowlist of frontends" because FitCheck is
// a single-origin app. If you ever add a separate marketing site that calls
// these endpoints, extend ALLOWED_ORIGINS instead of widening this function.
const ALLOWED_ORIGINS: string[] = [];

export function checkOrigin(req: Request): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  // Same-origin browser requests carry an Origin header that matches the
  // request URL's origin. We also accept a missing Origin (server-to-server,
  // some mobile webviews) but only when there's also no foreign Referer.
  const reqUrl = new URL(req.url);
  const ourOrigin = `${reqUrl.protocol}//${reqUrl.host}`;

  if (!origin) {
    // No Origin: accept only if Referer is also absent or same-origin.
    if (!referer) return null;
    try {
      const refOrigin = new URL(referer).origin;
      if (refOrigin === ourOrigin || ALLOWED_ORIGINS.includes(refOrigin)) {
        return null;
      }
    } catch {
      // malformed referer — reject
    }
    return forbidden();
  }

  if (origin === ourOrigin || ALLOWED_ORIGINS.includes(origin)) return null;
  return forbidden();
}

function forbidden(): NextResponse {
  return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
}

// Pre-parse body-size check using Content-Length. Cheap, no body buffering.
// Routes that accept big payloads (e.g. /api/analyze with base64 images) pass
// a larger limit; everything else gets a small default.
export function checkBodySize(
  req: Request,
  maxBytes: number,
): NextResponse | null {
  const lenHeader = req.headers.get("content-length");
  if (!lenHeader) return null; // chunked or unknown — fall through, route handles
  const len = Number(lenHeader);
  if (!Number.isFinite(len) || len < 0) {
    return NextResponse.json({ error: "Invalid Content-Length" }, { status: 400 });
  }
  if (len > maxBytes) {
    return NextResponse.json(
      { error: `Request too large (>${Math.round(maxBytes / 1024)} KB).` },
      { status: 413 },
    );
  }
  return null;
}
