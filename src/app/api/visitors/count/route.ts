import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api-error";

export const runtime = "nodejs";

// Returns the total number of unique browsers that have ever opened FitCheck.
// Public — no device id required.
export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const { count, error } = await supabase
      .from("visitors")
      .select("device_id", { count: "exact", head: true });

    if (error) throw error;

    return NextResponse.json(
      { count: count ?? 0 },
      {
        headers: {
          // Cheap CDN-friendly cache so the sidebar badge doesn't hit the DB
          // on every navigation.
          "Cache-Control": "public, max-age=30, s-maxage=60",
        },
      },
    );
  } catch (err) {
    return jsonError(err, 500, "GET /api/visitors/count");
  }
}
