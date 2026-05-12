import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDeviceUserId, LEGACY_USER_ID } from "@/lib/user-id";
import { jsonError } from "@/lib/api-error";
import { checkRateLimit, rateLimitResponseBody } from "@/lib/rate-limit";
import { checkBodySize, checkOrigin } from "@/lib/route-guard";
import { isUuid, sanitizeShortText } from "@/lib/sanitize";
import type { OutfitRecord, OutfitSource } from "@/lib/types";

export const runtime = "nodejs";

// Cap on how many outfits a single user can store. Old rows beyond this
// would still be readable but cluttered, and unbounded growth lets one
// device chew through Supabase's row quota. We GET-limit and don't proactively
// delete; if it becomes a problem we'll add a trimming policy.
const MAX_HISTORY_ROWS = 500;

// Cap on item_ids per outfit. There are 6 categories, but the model could
// in theory hand back duplicates or accessories — 16 is more than enough
// for any legitimate outfit while bounding payload size.
const MAX_ITEMS_PER_OUTFIT = 16;

const ALLOWED_SOURCES = new Set<OutfitSource>(["dress-me", "match"]);

// Same pattern as wardrobe: legacy/no-device-id clients can read (for
// back-compat) but cannot write to the shared bucket.
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

    const rl = checkRateLimit(req, "outfits-read");
    if (!rl.ok) {
      return NextResponse.json(rateLimitResponseBody(rl), { status: 429 });
    }

    const userId = getDeviceUserId(req);
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("outfits")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY_ROWS);

    if (error) throw error;

    return NextResponse.json({ outfits: (data ?? []) as OutfitRecord[] });
  } catch (err) {
    return jsonError(err, 500, "GET /api/outfits");
  }
}

export async function POST(req: Request) {
  try {
    const blocked = checkOrigin(req);
    if (blocked) return blocked;

    // Body: { source, occasion?, vibe?, reasoning?, item_ids: uuid[] }
    // 4 KB is plenty: 16 UUIDs (~600 chars) + short text fields.
    const oversized = checkBodySize(req, 4 * 1024);
    if (oversized) return oversized;

    const rl = checkRateLimit(req, "outfits-write");
    if (!rl.ok) {
      return NextResponse.json(rateLimitResponseBody(rl), { status: 429 });
    }

    const userId = getDeviceUserId(req);
    const denied = ensureDeviceIdForWrite(userId);
    if (denied) return denied;

    const body = (await req.json()) as {
      source?: unknown;
      occasion?: unknown;
      vibe?: unknown;
      reasoning?: unknown;
      item_ids?: unknown;
    };

    if (typeof body.source !== "string" || !ALLOWED_SOURCES.has(body.source as OutfitSource)) {
      return NextResponse.json(
        { error: "Invalid source (must be 'dress-me' or 'match')." },
        { status: 400 },
      );
    }
    const source = body.source as OutfitSource;

    const rawIds = Array.isArray(body.item_ids) ? body.item_ids : [];
    const itemIds = rawIds.filter(isUuid).slice(0, MAX_ITEMS_PER_OUTFIT);
    if (itemIds.length === 0) {
      return NextResponse.json(
        { error: "An outfit must contain at least one valid item." },
        { status: 400 },
      );
    }

    // Occasion / vibe / reasoning are all optional. We reuse sanitizeShortText
    // (which also screens for prompt-injection-ish strings) since these
    // fields are user/Gemini-derived and end up in our UI.
    const optional = (
      raw: unknown,
      maxLen: number,
      fieldName: string,
    ): string | null | { error: string } => {
      if (raw === null || raw === undefined || raw === "") return null;
      const result = sanitizeShortText(raw, { maxLen, fieldName });
      if (!result.ok) return { error: result.reason };
      return result.value;
    };

    const occasion = optional(body.occasion, 80, "occasion");
    if (occasion && typeof occasion === "object") {
      return NextResponse.json({ error: occasion.error }, { status: 400 });
    }
    const vibe = optional(body.vibe, 60, "vibe");
    if (vibe && typeof vibe === "object") {
      return NextResponse.json({ error: vibe.error }, { status: 400 });
    }
    // Reasoning is the longest free-form field — Gemini returns 1-2 sentences.
    // 400 chars is comfortably above the prompt's "1-2 sentence" target.
    const reasoning = optional(body.reasoning, 400, "reasoning");
    if (reasoning && typeof reasoning === "object") {
      return NextResponse.json({ error: reasoning.error }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("outfits")
      .insert({
        user_id: userId,
        source,
        occasion: occasion as string | null,
        vibe: vibe as string | null,
        reasoning: reasoning as string | null,
        item_ids: itemIds,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ outfit: data as OutfitRecord });
  } catch (err) {
    return jsonError(err, 500, "POST /api/outfits");
  }
}
