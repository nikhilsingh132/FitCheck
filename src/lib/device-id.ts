// Anonymous per-browser identity. We deliberately avoid a login screen — every
// visitor gets a random UUID on first load and reuses it from localStorage.
// Server routes treat this as the `user_id` for the wardrobe row.
//
// Trade-offs:
//   - Clearing browser storage = losing access to your wardrobe rows.
//   - No cross-device sync (phone + laptop = two separate closets).
//   - Anyone who guesses the id can read its rows, but the actual images
//     never leave the original browser (they're in IndexedDB).
//
// Upgrade path: swap this for Supabase Anonymous Auth and pull the id from
// `auth.uid()` server-side. The shape of the API doesn't need to change.

const STORAGE_KEY = "fitcheck_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage disabled — fall back to a per-tab id so the app
    // still works, even though refreshing will create a new "user".
    return crypto.randomUUID();
  }
}

export const DEVICE_ID_HEADER = "x-device-id";
