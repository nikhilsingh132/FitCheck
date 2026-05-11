// Server-side helper: pulls the anonymous device id out of the request header
// and uses it as the wardrobe row owner.
//
// Falls back to "demo-user" so legacy rows created before device ids were
// introduced remain accessible from any browser without the header.

import { DEVICE_ID_HEADER } from "@/lib/device-id";

export const LEGACY_USER_ID = "demo-user";

// Basic shape check — we don't want clients smuggling arbitrary strings into
// user_id (e.g. SQL filters on someone else's rows). UUID v4 is what
// getDeviceId() actually produces.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getDeviceUserId(req: Request): string {
  const raw = req.headers.get(DEVICE_ID_HEADER);
  // Hard length cap before regex check — a megabyte of "a"s won't make our
  // regex engine work hard.
  if (raw && raw.length <= 64 && UUID_RE.test(raw)) return raw;
  return LEGACY_USER_ID;
}
