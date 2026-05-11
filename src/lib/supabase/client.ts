import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (browserClient) return browserClient;

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!rawUrl || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }

  // The Supabase JS client appends "/rest/v1/<table>" itself, so trim any path
  // (e.g. "/rest/v1/") users might have copied from the Data API panel.
  const url = normalizeSupabaseUrl(rawUrl);

  browserClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return browserClient;
}

function normalizeSupabaseUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    return `${u.protocol}//${u.host}`;
  } catch {
    return raw.replace(/\/+$/, "").replace(/\/rest\/v1.*$/, "");
  }
}
