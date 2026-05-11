// Thin wrapper around fetch that:
//   - Always attaches the anonymous device id header.
//   - Sets JSON Content-Type when a body is provided.
//   - Leaves response handling to the caller (so they can keep returning the
//     useful error messages we already surface in toasts).
//
// Server route handlers read the device id via `getDeviceUserId(req)` from
// `@/lib/user-id` and use it as the wardrobe row owner.

import { DEVICE_ID_HEADER, getDeviceId } from "@/lib/device-id";
import { GENDER_HEADER, getGenderForHeader } from "@/lib/gender";

type ApiInit = Omit<RequestInit, "headers"> & {
  headers?: HeadersInit;
  // Convenience: pass an object and we'll JSON.stringify + set Content-Type.
  json?: unknown;
};

export function apiFetch(input: string, init: ApiInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set(DEVICE_ID_HEADER, getDeviceId());

  // Only attach the gender header when the user has actually picked one — the
  // server already defaults to "unisex" if it's missing.
  const gender = getGenderForHeader();
  if (gender) headers.set(GENDER_HEADER, gender);

  let body = init.body;
  if (init.json !== undefined) {
    body = JSON.stringify(init.json);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  const { json: _json, ...rest } = init;
  void _json;
  return fetch(input, { ...rest, headers, body });
}
