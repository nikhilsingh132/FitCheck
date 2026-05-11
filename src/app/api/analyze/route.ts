import { NextResponse } from "next/server";
import {
  getGeminiModel,
  safeParseJSON,
  runGeminiWithRetry,
  geminiRetryToResponse,
} from "@/lib/gemini";
import { jsonError } from "@/lib/api-error";
import { readGenderHeader, genderPromptLabel } from "@/lib/gender";
import { checkRateLimit, rateLimitResponseBody } from "@/lib/rate-limit";
import { checkBodySize, checkOrigin } from "@/lib/route-guard";
import { sanitizeImageInput, MAX_BASE64_BYTES } from "@/lib/sanitize";
import type { AnalyzedTags } from "@/lib/types";
import type { GenderPref } from "@/lib/gender";

export const runtime = "nodejs";

// Hard ceiling so a runaway client can't blow up the prompt size or push us
// off the Gemini context window. The upload page chunks well below this.
const MAX_BATCH_SIZE = 8;

type ImageInput = {
  id: string;
  imageBase64: string;
  mimeType?: string;
};

type AnalyzeRequest = {
  // New batched shape.
  images?: ImageInput[];
  // Legacy single-image shape, kept for back-compat.
  imageBase64?: string;
  mimeType?: string;
};

type GeminiBatchResult = {
  id: string;
  isClothing: boolean;
  tags: AnalyzedTags | null;
};

export type AnalyzeBatchResultItem =
  | { id: string; ok: true; tags: AnalyzedTags }
  | { id: string; ok: false; code: "NOT_CLOTHING" | "MISSING"; error: string };

function buildBatchPrompt(ids: string[], gender: GenderPref): string {
  // We only bias the *wording* of style/vibe tags toward the user's audience.
  // We deliberately DON'T reject items that look "off-gender" — partners share
  // accounts, and lots of pieces are unisex.
  const audienceHint =
    gender === "unisex"
      ? "Use gender-neutral wording for style and vibe."
      : `The user dresses in ${genderPromptLabel(gender)} fashion — phrase the "style" and "vibe" tags accordingly (still describe the actual garment shown, even if it looks unisex).`;

  return `You are a professional fashion stylist. You will be given ${ids.length} image(s) in order.
For each image, decide whether it clearly shows a wearable clothing or fashion accessory item
(e.g. shirt, pants, jacket, shoes, watch, belt, bag, hat, sunglasses, jewelry).
A person wearing an outfit also counts as long as the garments are clearly visible.
Things that DO NOT count: empty rooms, food, animals, screenshots, memes, landscapes,
furniture, electronics that are not wearable, or any image where no clothing/accessory is visible.

${audienceHint}

Return ONLY a JSON array with EXACTLY ${ids.length} entries, in the same order as the images.
Each entry MUST use the corresponding "id" from this list (in order): ${JSON.stringify(ids)}.

Shape of each entry:
{
  "id": "<one of the ids above, matching the image position>",
  "isClothing": boolean,
  "tags": {
    "category": one of ["Tops", "Bottoms", "Outerwear", "Shoes", "Watches", "Accessories"],
    "color": dominant color in plain English (e.g. "navy blue", "off-white"),
    "style": short style tag (e.g. "casual t-shirt", "slim-fit chinos", "leather oxford"),
    "material": best-guess material (e.g. "cotton", "denim", "leather", "stainless steel"),
    "vibe": 2-3 word vibe (e.g. "minimalist streetwear", "smart casual", "formal classic")
  } | null
}

Rules:
- If "isClothing" is false, set "tags" to null.
- If "isClothing" is true, fill every "tags" field; keep each value short (max ~4 words).
- Return ONLY the JSON array, no prose, no code fences, no surrounding object.`;
}

const NOT_CLOTHING_MESSAGE =
  "No clothing or accessory detected in this image. Please upload a photo of a wearable item.";

// Per-image base64 cap is enforced by sanitizeImageInput. The whole-request
// cap below allows a full batch (8 images) plus JSON overhead — anything
// past this is rejected before req.json() parses it.
const MAX_TOTAL_BODY_BYTES = MAX_BATCH_SIZE * MAX_BASE64_BYTES + 8 * 1024;

export async function POST(req: Request) {
  try {
    // 1) Same-origin enforcement in production — drops casual curl/bot
    //    traffic from outside our domain.
    const blocked = checkOrigin(req);
    if (blocked) return blocked;

    // 2) Content-Length check BEFORE req.json() so a multi-MB upload can't
    //    eat memory just to be rejected at field-validation time.
    const oversized = checkBodySize(req, MAX_TOTAL_BODY_BYTES);
    if (oversized) return oversized;

    // 3) Rate-limit before parsing the body so a flood of huge payloads
    //    can't OOM us. checkRateLimit returns the same 429 shape the client
    //    already handles for Gemini quota errors.
    const rl = checkRateLimit(req, "analyze");
    if (!rl.ok) {
      return NextResponse.json(rateLimitResponseBody(rl), { status: 429 });
    }

    const body = (await req.json()) as AnalyzeRequest;

    // Normalize to a batch internally so the rest of the route is uniform.
    let images: ImageInput[] = [];
    if (body.images && Array.isArray(body.images)) {
      images = body.images.filter(
        (img): img is ImageInput =>
          !!img && typeof img.id === "string" && typeof img.imageBase64 === "string",
      );
    } else if (body.imageBase64) {
      images = [
        {
          id: "single",
          imageBase64: body.imageBase64,
          mimeType: body.mimeType,
        },
      ];
    }

    if (images.length === 0) {
      return NextResponse.json(
        { error: "Provide an `images` array or `imageBase64`." },
        { status: 400 },
      );
    }
    if (images.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch too large; max ${MAX_BATCH_SIZE} per request.` },
        { status: 400 },
      );
    }

    // 2) Validate each image: base64 shape, allowed mime type, size cap.
    //    Anything bogus is rejected before we burn a Gemini call.
    const sanitized: ImageInput[] = [];
    for (const img of images) {
      const check = sanitizeImageInput(img.imageBase64, img.mimeType);
      if (!check.ok) {
        return NextResponse.json(
          { error: `Image "${img.id}": ${check.reason}` },
          { status: 400 },
        );
      }
      sanitized.push({
        id: img.id,
        imageBase64: check.base64,
        mimeType: check.mimeType,
      });
    }
    images = sanitized;

    const ids = images.map((img) => img.id);
    const gender = readGenderHeader(req);
    const prompt = buildBatchPrompt(ids, gender);

    const model = getGeminiModel();
    const result = await runGeminiWithRetry(() =>
      model.generateContent([
        { text: prompt },
        ...images.map((img) => ({
          inlineData: {
            data: img.imageBase64,
            mimeType: img.mimeType || "image/webp",
          },
        })),
      ]),
    );

    const raw = result.response.text();

    // Gemini sometimes wraps the array in an object like { results: [...] }
    // when responseMimeType is set; safeParseJSON returns whatever it gets and
    // we coerce here.
    const parsed = safeParseJSON<unknown>(raw);
    const arr = coerceToArray(parsed);
    if (!arr) {
      return NextResponse.json(
        { error: "Could not parse Gemini response", raw },
        { status: 502 },
      );
    }

    // Index Gemini's results by id, then walk the input order so missing or
    // duplicated ids degrade gracefully into per-image errors.
    const byId = new Map<string, GeminiBatchResult>();
    for (const entry of arr) {
      if (entry && typeof entry === "object" && "id" in entry) {
        const e = entry as GeminiBatchResult;
        if (typeof e.id === "string") byId.set(e.id, e);
      }
    }

    const results: AnalyzeBatchResultItem[] = images.map((img) => {
      const r = byId.get(img.id);
      if (!r) {
        return {
          id: img.id,
          ok: false,
          code: "MISSING",
          error: "Gemini did not return tags for this image.",
        };
      }
      if (!r.isClothing || !r.tags) {
        return {
          id: img.id,
          ok: false,
          code: "NOT_CLOTHING",
          error: NOT_CLOTHING_MESSAGE,
        };
      }
      return { id: img.id, ok: true, tags: r.tags };
    });

    // Back-compat: a legacy single-image caller expects the old `{ tags }` /
    // `{ error, code: NOT_CLOTHING }` shape, not a `results` array.
    if (!body.images && body.imageBase64) {
      const only = results[0];
      if (only.ok) {
        return NextResponse.json({ tags: only.tags });
      }
      if (only.code === "NOT_CLOTHING") {
        return NextResponse.json(
          { error: only.error, code: "NOT_CLOTHING" },
          { status: 422 },
        );
      }
      return NextResponse.json({ error: only.error }, { status: 502 });
    }

    return NextResponse.json({ results });
  } catch (err) {
    const retry = geminiRetryToResponse(err);
    if (retry) return NextResponse.json(retry.body, { status: retry.status });
    return jsonError(err, 500, "POST /api/analyze");
  }
}

function coerceToArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["results", "items", "data"]) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
  }
  return null;
}
