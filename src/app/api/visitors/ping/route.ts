import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDeviceUserId, LEGACY_USER_ID } from "@/lib/user-id";
import { jsonError } from "@/lib/api-error";
import { checkRateLimit, rateLimitResponseBody } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/route-guard";

export const runtime = "nodejs";

// Called once per page load from <AppShell>. Records the visitor and bumps
// last_seen. The hardcoded LEGACY_USER_ID is ignored so we don't pollute the
// real visitor count when the device id header is missing.
export async function POST(req: Request) {
  try {
    const blocked = checkOrigin(req);
    if (blocked) return blocked;

    // IP-only rate limit: an attacker can spin up infinite device IDs to
    // inflate the visitor counter, so capping per-device buys us nothing.
    // 5/min and 50/day per IP still lets a real shared NAT (office, school)
    // through but kills serial inflation.
    const rl = checkRateLimit(req, "visitor-ping", { ipOnly: true });
    if (!rl.ok) {
      return NextResponse.json(rateLimitResponseBody(rl), { status: 429 });
    }

    const deviceId = getDeviceUserId(req);
    if (deviceId === LEGACY_USER_ID) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Single-statement upsert-and-increment via a SECURITY DEFINER function.
    // The previous two-step approach (`update last_seen` → maybe `insert`)
    // had two bugs: (1) it never actually incremented `visits` on the update
    // path because PostgREST .update() can't reference a column in its own
    // SET clause, so every returning visitor was stuck at visits=1, and
    // (2) two parallel pings could both miss the existing row and race to
    // insert. The RPC fixes both atomically. See the corresponding migration
    // 2026_05_12_fix_visitor_increment.sql.
    const supabase = getSupabaseServer();
    const { error: rpcErr } = await supabase.rpc("increment_visitor", {
      p_device_id: deviceId,
    });
    if (rpcErr) throw rpcErr;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err, 500, "POST /api/visitors/ping");
  }
}
