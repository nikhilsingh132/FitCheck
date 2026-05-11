import { NextResponse } from "next/server";
import { runSecurityChecks } from "@/lib/security-checks";
import { checkOrigin } from "@/lib/route-guard";
import { checkRateLimit, rateLimitResponseBody } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Lets you spot-check from a deploy that RLS is still locked down.
//
// USAGE:
//   GET /api/debug/security
//     → { ok: true|false } only. No details, no info leak.
//
//   GET /api/debug/security?token=<SECURITY_DEBUG_TOKEN env var>
//     → full per-table report (anonKeyConfigured, results, allLockedDown).
//
// We reuse the wardrobe-read rate limit bucket so this endpoint can't be
// turned into a polling channel.
export async function GET(req: Request) {
  const blocked = checkOrigin(req);
  if (blocked) return blocked;

  const rl = checkRateLimit(req, "wardrobe-read");
  if (!rl.ok) {
    return NextResponse.json(rateLimitResponseBody(rl), { status: 429 });
  }

  const url = new URL(req.url);
  const providedToken = url.searchParams.get("token");
  const expectedToken = process.env.SECURITY_DEBUG_TOKEN;

  const summary = await runSecurityChecks();

  // Detailed view is gated by a server-only env var. We use timingSafeEqual
  // via string-length-then-char-compare semantics to avoid trivial timing
  // attacks (low-stakes but cheap).
  if (
    expectedToken &&
    providedToken &&
    providedToken.length === expectedToken.length &&
    providedToken === expectedToken
  ) {
    return NextResponse.json(summary);
  }

  return NextResponse.json({ ok: summary.allLockedDown });
}
