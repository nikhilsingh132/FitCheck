import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getGeminiModel,
  safeParseJSON,
  runGeminiWithRetry,
  geminiRetryToResponse,
} from "@/lib/gemini";
import { getDeviceUserId } from "@/lib/user-id";
import { jsonError } from "@/lib/api-error";
import { readGenderHeader, genderInstruction } from "@/lib/gender";
import { checkRateLimit, rateLimitResponseBody } from "@/lib/rate-limit";
import { checkBodySize, checkOrigin } from "@/lib/route-guard";
import { isUuid } from "@/lib/sanitize";
import type { OutfitSuggestion, WardrobeItem } from "@/lib/types";
import type { GenderPref } from "@/lib/gender";

export const runtime = "nodejs";

// Match-page shuffles also want the regenerated outfit to feel different.
// Since the user-pinned items always stay, we only count the ADDED items
// (the Gemini-picked ones) against the variance threshold.
function minAddedSwapsRequired(previouslyAdded: number): number {
  if (previouslyAdded >= 4) return Math.max(2, Math.ceil(previouslyAdded / 2));
  if (previouslyAdded >= 2) return 1;
  // If Gemini only added 1 item last time, we still want that 1 to change.
  return previouslyAdded > 0 ? 1 : 0;
}

function buildPrompt(
  selected: WardrobeItem[],
  pool: WardrobeItem[],
  gender: GenderPref,
  excludeAddedIds: string[],
) {
  const compactSelected = selected.map((it) => ({
    id: it.id,
    category: it.category,
    color: it.color,
    style: it.style,
    material: it.material,
    vibe: it.vibe,
  }));
  const compactPool = pool.map((it) => ({
    id: it.id,
    category: it.category,
    color: it.color,
    style: it.style,
    material: it.material,
    vibe: it.vibe,
  }));

  const shuffleBlock =
    excludeAddedIds.length > 0
      ? `

The user already saw a completed look that ADDED these item ids around their pinned pieces, and asked for a DIFFERENT look:
${JSON.stringify(excludeAddedIds)}
- Build a fresh outfit around the same pinned pieces. At least ${minAddedSwapsRequired(excludeAddedIds.length)} of the ADDED items MUST be different from that previous list.
- Prefer swapping ALL added items if the wardrobe allows it.
- If the remaining wardrobe truly can't produce a sufficiently different completion, return an empty "item_ids" array and set "vibe" to "no_alternative".`
      : "";

  return `You are a senior personal stylist. The user has already chosen these item(s) and wants you to COMPLETE THE LOOK using only the remaining items in their wardrobe.

${genderInstruction(gender)}

Already chosen (must be kept in the final outfit):
${JSON.stringify(compactSelected, null, 2)}

Remaining wardrobe pool (you can pick from these):
${JSON.stringify(compactPool, null, 2)}

Rules:
- Do NOT suggest more items from a category that the user already chose.
- Aim for a complete outfit: include a Top, Bottom, and Shoes if available; add Outerwear / Watch / Accessories if they elevate the look.
- Colors, styles, and vibes must harmonize with the chosen items.
- Reasoning and vibe wording must match the styling audience described above.
- Return ONLY JSON:
{
  "item_ids": ["<uuid of EACH item in the final outfit, including the user's chosen items>", ...],
  "reasoning": "1-2 sentence explanation of why these complete the chosen items",
  "vibe": "short vibe label"
}
- Use ONLY ids that exist in the inputs above. Do not invent ids.${shuffleBlock}`;
}

export async function POST(req: Request) {
  try {
    const blocked = checkOrigin(req);
    if (blocked) return blocked;

    // Body: { item_ids: uuid[<=2], exclude_item_ids?: uuid[<=8] }.
    // 2 KB ceiling kills probing; UUIDs are short.
    const oversized = checkBodySize(req, 2 * 1024);
    if (oversized) return oversized;

    const rl = checkRateLimit(req, "match");
    if (!rl.ok) {
      return NextResponse.json(rateLimitResponseBody(rl), { status: 429 });
    }

    const body = (await req.json()) as {
      item_ids?: unknown;
      exclude_item_ids?: unknown;
    };
    const rawIds = Array.isArray(body.item_ids) ? body.item_ids : [];
    // Strict UUID shape check stops anyone from smuggling weird strings into
    // the supabase filter (defense-in-depth — PostgREST already escapes).
    const ids = rawIds.filter(isUuid);
    if (ids.length === 0) {
      return NextResponse.json(
        { error: "Pick at least one item to match against." },
        { status: 400 },
      );
    }
    if (ids.length > 2) {
      return NextResponse.json(
        { error: "Pick at most two items." },
        { status: 400 },
      );
    }

    const rawExclude = Array.isArray(body.exclude_item_ids)
      ? body.exclude_item_ids
      : [];
    // The "exclude" list should be the items Gemini ADDED last time — not
    // the user's pinned ones — so we filter those out defensively here too.
    const pinnedSet = new Set(ids);
    const excludeAddedIds = rawExclude
      .filter(isUuid)
      .filter((id) => !pinnedSet.has(id))
      .slice(0, 8);

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("wardrobe")
      .select("*")
      .eq("user_id", getDeviceUserId(req));
    if (error) throw error;

    const items = (data ?? []) as WardrobeItem[];
    const selected = items.filter((i) => ids.includes(i.id));
    if (selected.length !== ids.length) {
      return NextResponse.json(
        { error: "Some selected items were not found." },
        { status: 404 },
      );
    }

    const selectedCats = new Set(
      selected.map((s) => s.category).filter(Boolean) as string[],
    );
    const pool = items.filter(
      (i) =>
        !ids.includes(i.id) &&
        (!i.category || !selectedCats.has(i.category)),
    );

    if (pool.length === 0) {
      return NextResponse.json({
        items: selected,
        reasoning: "Your wardrobe doesn't have other categories to complete this look yet.",
        vibe: selected[0]?.vibe ?? "your pick",
      });
    }

    const gender = readGenderHeader(req);
    const model = getGeminiModel();
    const result = await runGeminiWithRetry(() =>
      model.generateContent(
        buildPrompt(selected, pool, gender, excludeAddedIds),
      ),
    );
    const raw = result.response.text();
    const suggestion = safeParseJSON<OutfitSuggestion>(raw);

    if (!suggestion?.item_ids) {
      return NextResponse.json(
        { error: "Could not parse outfit from Gemini", raw },
        { status: 502 },
      );
    }
    if (suggestion.item_ids.length === 0 && excludeAddedIds.length === 0) {
      return NextResponse.json(
        { error: "Could not parse outfit from Gemini", raw },
        { status: 502 },
      );
    }

    const validIds = new Set(items.map((i) => i.id));
    let picked = suggestion.item_ids
      .filter((id) => validIds.has(id))
      .map((id) => items.find((i) => i.id === id)!)
      .filter(Boolean);

    // Guarantee user-selected items are in the result.
    for (const sel of selected) {
      if (!picked.find((p) => p.id === sel.id)) picked = [sel, ...picked];
    }

    // Shuffle variance check: only the ADDED items (non-pinned) count.
    if (excludeAddedIds.length > 0) {
      const excludeSet = new Set(excludeAddedIds);
      const addedNow = picked.filter((p) => !pinnedSet.has(p.id));
      const changed = addedNow.filter((p) => !excludeSet.has(p.id)).length;
      const required = minAddedSwapsRequired(excludeAddedIds.length);
      if (addedNow.length === 0 || changed < required) {
        return NextResponse.json(
          {
            no_alternative: true,
            reason:
              "Your wardrobe doesn't have enough variety to complete this look differently.",
          },
          { status: 200 },
        );
      }
    }

    return NextResponse.json({
      reasoning: suggestion.reasoning,
      vibe: suggestion.vibe,
      items: picked,
    });
  } catch (err) {
    const retry = geminiRetryToResponse(err);
    if (retry) return NextResponse.json(retry.body, { status: retry.status });
    return jsonError(err, 500, "POST /api/match");
  }
}
