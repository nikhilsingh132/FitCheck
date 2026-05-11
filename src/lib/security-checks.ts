// Runtime self-check: confirms that our Supabase RLS policies are locked
// down. Specifically, we try to read the wardrobe and visitors tables using
// the public anon key (the one bundled into the browser). If RLS is working,
// these reads MUST return zero rows (or an error). If we get rows back, the
// anon key can dump the table, which is the F12 vulnerability — we log a
// loud warning and surface it via /api/debug/security so deploys can be
// spot-checked.
//
// This file deliberately uses the anon key, NOT the service role. It's the
// only place in the server code that does so.

import { createClient } from "@supabase/supabase-js";

export type RlsCheckResult = {
  table: string;
  // ok === true means anon CANNOT read the table (which is what we want).
  ok: boolean;
  // Rows returned via anon key. Should always be 0 if RLS is locked down.
  rowCount: number;
  // Error from Supabase, if any. A permission error here is GOOD — it means
  // RLS blocked us.
  error: string | null;
};

export type SecurityCheckSummary = {
  anonKeyConfigured: boolean;
  results: RlsCheckResult[];
  allLockedDown: boolean;
};

function getAnonClient() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!rawUrl || !anonKey) return null;

  // Same URL-normalization rule as the rest of the app.
  let url = rawUrl.trim();
  try {
    const u = new URL(url);
    url = `${u.protocol}//${u.host}`;
  } catch {
    url = url.replace(/\/+$/, "").replace(/\/rest\/v1.*$/, "");
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function probeTable(
  client: ReturnType<typeof getAnonClient>,
  table: string,
): Promise<RlsCheckResult> {
  if (!client) {
    return { table, ok: false, rowCount: 0, error: "anon client not configured" };
  }
  // limit(1) keeps the probe cheap and avoids accidentally pulling rows into
  // our logs if the policies are still wide open.
  const { data, error } = await client.from(table).select("*").limit(1);

  // A "permission denied" / RLS rejection is the GOOD outcome: anon can't
  // read, so the table is locked down. Treat any error here as ok=true.
  if (error) {
    return { table, ok: true, rowCount: 0, error: error.message };
  }
  const rowCount = data?.length ?? 0;
  return {
    table,
    ok: rowCount === 0,
    rowCount,
    error: null,
  };
}

let cachedSummary: SecurityCheckSummary | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

export async function runSecurityChecks(force = false): Promise<SecurityCheckSummary> {
  const now = Date.now();
  if (!force && cachedSummary && now - cachedAt < CACHE_MS) {
    return cachedSummary;
  }

  const client = getAnonClient();
  const anonKeyConfigured = client !== null;

  const results = await Promise.all([
    probeTable(client, "wardrobe"),
    probeTable(client, "visitors"),
  ]);

  const allLockedDown = results.every((r) => r.ok);

  if (!allLockedDown) {
    // Loud, structured warning so this is impossible to miss in production
    // logs. Vercel / hosting dashboards will surface it.
    console.error(
      "[SECURITY] Supabase RLS check FAILED — the anon key can read protected tables. " +
        "Run supabase/migrations/2026_05_11_lock_down_rls.sql in your Supabase SQL editor.",
      results.filter((r) => !r.ok),
    );
  }

  cachedSummary = { anonKeyConfigured, results, allLockedDown };
  cachedAt = now;
  return cachedSummary;
}
