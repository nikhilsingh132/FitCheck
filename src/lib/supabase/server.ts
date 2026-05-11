import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serverClient: SupabaseClient | null = null;
let rlsCheckKicked = false;

// Server-only client. Uses the service-role key when available so route
// handlers can bypass RLS for trusted server work; falls back to anon.
export function getSupabaseServer(): SupabaseClient {
  // Kick off the RLS self-check on first use. Fire-and-forget so we don't
  // slow the request that triggered it; the check itself is cached for 5
  // minutes and logs a loud warning if anon can read protected tables.
  // The dynamic import avoids a circular dep (security-checks imports the
  // anon client, not this file, but we still want lazy loading).
  if (!rlsCheckKicked) {
    rlsCheckKicked = true;
    import("@/lib/security-checks")
      .then((m) => m.runSecurityChecks())
      .catch(() => {
        // Self-check failures should never break the request path.
      });
  }

  if (serverClient) return serverClient;

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!rawUrl || !key) {
    throw new Error(
      "Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL + service role or anon key)",
    );
  }

  // The Supabase JS client appends "/rest/v1/<table>" itself, so the URL must
  // be the bare project URL ("https://xxxx.supabase.co"). Trim any path users
  // might have copied from the Data API panel.
  const url = normalizeSupabaseUrl(rawUrl);

  serverClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serverClient;
}

function normalizeSupabaseUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    return `${u.protocol}//${u.host}`;
  } catch {
    return raw.replace(/\/+$/, "").replace(/\/rest\/v1.*$/, "");
  }
}
