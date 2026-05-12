import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDeviceUserId, LEGACY_USER_ID } from "@/lib/user-id";
import { jsonError } from "@/lib/api-error";
import { checkRateLimit, rateLimitResponseBody } from "@/lib/rate-limit";
import { checkBodySize, checkOrigin } from "@/lib/route-guard";
import { sanitizeVisitorName } from "@/lib/visitor-name";

// Node runtime: we use the Supabase service-role client which depends on
// `crypto` and other Node built-ins not available in the Edge runtime.
export const runtime = "nodejs";

// One-shot endpoint called by the first-visit name dialog. Persists the
// self-reported display name onto the existing visitors row so the operator
// can see who tried the app. The companion Postgres function refuses to
// overwrite an existing name, so re-calls from the same device are no-ops.
export async function POST(req: Request) {
  try {
    const blocked = checkOrigin(req);
    if (blocked) return blocked;

    // Body is { name: "<letters and spaces>" }. 256 bytes is plenty.
    const oversized = checkBodySize(req, 256);
    if (oversized) return oversized;

    // Tight rate limit: a real user only ever hits this once. The 3/min
    // 10/day ceiling kills any automated script trying to spray names
    // through the table.
    const rl = checkRateLimit(req, "visitor-name");
    if (!rl.ok) {
      return NextResponse.json(rateLimitResponseBody(rl), { status: 429 });
    }

    const deviceId = getDeviceUserId(req);
    if (deviceId === LEGACY_USER_ID) {
      return NextResponse.json(
        { error: "A valid device id is required." },
        { status: 401 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { name?: unknown };
    const sanitized = sanitizeVisitorName(body.name);
    if (!sanitized.ok) {
      return NextResponse.json({ error: sanitized.reason }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const { error } = await supabase.rpc("set_visitor_name", {
      p_device_id: deviceId,
      p_name: sanitized.value,
    });
    if (error) throw error;

    return NextResponse.json({ ok: true, name: sanitized.value });
  } catch (err) {
    return jsonError(err, 500, "POST /api/visitors/name");
  }
}
