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

    const supabase = getSupabaseServer();
    const now = new Date().toISOString();

    // Try to bump last_seen + visits on an existing row first; if no row was
    // updated, insert a new one. We avoid `upsert` because Postgres can't
    // increment a column in a single upsert without an RPC.
    const { data: updated, error: updateErr } = await supabase
      .from("visitors")
      .update({ last_seen: now })
      .eq("device_id", deviceId)
      .select("device_id");

    if (updateErr) throw updateErr;

    if (!updated || updated.length === 0) {
      const { error: insertErr } = await supabase
        .from("visitors")
        .insert({ device_id: deviceId, first_seen: now, last_seen: now, visits: 1 });
      // Race-safe: if another request inserted the row a microsecond ago,
      // ignore the duplicate-key error.
      if (insertErr && insertErr.code !== "23505") throw insertErr;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err, 500, "POST /api/visitors/ping");
  }
}
