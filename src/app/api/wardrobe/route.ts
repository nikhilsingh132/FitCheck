import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDeviceUserId, LEGACY_USER_ID } from "@/lib/user-id";
import { jsonError } from "@/lib/api-error";
import { checkRateLimit, rateLimitResponseBody } from "@/lib/rate-limit";
import { checkBodySize, checkOrigin } from "@/lib/route-guard";
import { isUuid, sanitizeWardrobeTags } from "@/lib/sanitize";

export const runtime = "nodejs";

// Anyone whose device id falls back to LEGACY_USER_ID is treated as a
// "no real identity" client. We still allow GET (for back-compat with very
// old browsers) but block WRITE so attackers can't pile rows onto the
// shared legacy account.
function ensureDeviceIdForWrite(userId: string): NextResponse | null {
  if (userId === LEGACY_USER_ID) {
    return NextResponse.json(
      { error: "A valid device id is required to write." },
      { status: 401 },
    );
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const blocked = checkOrigin(req);
    if (blocked) return blocked;

    const rl = checkRateLimit(req, "wardrobe-read");
    if (!rl.ok) {
      return NextResponse.json(rateLimitResponseBody(rl), { status: 429 });
    }

    const url = new URL(req.url);
    const rawCategory = url.searchParams.get("category");
    // Category filter is user-controlled; cap it so a megabyte of query
    // string can't push Postgres into a slow path.
    const category =
      rawCategory && rawCategory.length <= 40 ? rawCategory : null;
    const userId = getDeviceUserId(req);

    const supabase = getSupabaseServer();
    let query = supabase
      .from("wardrobe")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      // Hard ceiling so even a compromised account can't make this endpoint
      // return megabytes of rows.
      .limit(500);

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    return jsonError(err, 500, "GET /api/wardrobe");
  }
}

export async function POST(req: Request) {
  try {
    const blocked = checkOrigin(req);
    if (blocked) return blocked;

    // 5 KB is more than enough for one wardrobe row's tags. Anything bigger
    // is a probing attempt or a bug, so 413 it before parsing.
    const oversized = checkBodySize(req, 5 * 1024);
    if (oversized) return oversized;

    const rl = checkRateLimit(req, "wardrobe-write");
    if (!rl.ok) {
      return NextResponse.json(rateLimitResponseBody(rl), { status: 429 });
    }

    const userId = getDeviceUserId(req);
    const denied = ensureDeviceIdForWrite(userId);
    if (denied) return denied;

    const body = (await req.json()) as {
      id?: unknown;
      category?: unknown;
      color?: unknown;
      style?: unknown;
      material?: unknown;
      vibe?: unknown;
    };

    // Client-supplied id keeps IndexedDB and Postgres in sync. We require
    // a real UUID so nothing else (e.g. "../../etc/passwd") can sneak into
    // the primary key, and so the row stays addressable by the same id from
    // the browser.
    if (body.id !== undefined && !isUuid(body.id)) {
      return NextResponse.json(
        { error: "Invalid id (must be a UUID v4)." },
        { status: 400 },
      );
    }

    const tags = sanitizeWardrobeTags(body);
    if (!tags.ok) {
      return NextResponse.json({ error: tags.reason }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("wardrobe")
      .insert({
        ...(body.id ? { id: body.id as string } : {}),
        user_id: userId,
        category: tags.tags.category,
        color: tags.tags.color,
        style: tags.tags.style,
        material: tags.tags.material,
        vibe: tags.tags.vibe,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ item: data });
  } catch (err) {
    return jsonError(err, 500, "POST /api/wardrobe");
  }
}

export async function DELETE(req: Request) {
  try {
    const blocked = checkOrigin(req);
    if (blocked) return blocked;

    const rl = checkRateLimit(req, "wardrobe-delete");
    if (!rl.ok) {
      return NextResponse.json(rateLimitResponseBody(rl), { status: 429 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: "id is required (UUID v4)." },
        { status: 400 },
      );
    }

    const userId = getDeviceUserId(req);
    const denied = ensureDeviceIdForWrite(userId);
    if (denied) return denied;

    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from("wardrobe")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err, 500, "DELETE /api/wardrobe");
  }
}
