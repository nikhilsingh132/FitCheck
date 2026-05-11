# FitCheck — Your $0 AI Personal Stylist

Upload photos of every piece in your closet, let **Gemini 2.5 Flash** auto-tag
them, and get full outfit recommendations on demand — either by occasion
(*Office, Gym, Date, Party…*) or by completing a look around 1–2 items you've
picked. Built entirely on free tiers.

## Where the data lives

- **Image bytes** → your **browser's IndexedDB** only. Never uploaded to our
  servers. Each image is compressed to WebP under ~100 KB before storage.
- **Tag metadata** (category, color, style, material, vibe) → **Postgres**
  (Supabase free tier). Keyed by the same `id` we use locally so the two
  rejoin trivially.
- **Image is shown to Gemini once** at upload time to extract tags, then
  forgotten by the server.

This means the entire app runs at near-zero cost (Postgres rows are tiny) and
your closet photos stay private to your device.

> Trade-off: if you open FitCheck on a different browser/device, you'll see
> all your tagged items but the previews will show a "Image not on this
> device" placeholder. Outfit suggestions still work because Gemini reasons
> over tags, not pixels.

## Tech Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) + Route Handlers
- **Material UI v9** + **Material Icons** (with Emotion + `material-nextjs`)
- **Supabase Postgres** (no Storage, no Auth — single-user demo)
- **Browser IndexedDB** for image blobs (tiny native wrapper, no extra deps)
- **Google Gemini 2.5 Flash** via `@google/generative-ai` (free tier)
- **`browser-image-compression`** — client-side compression to WebP
- **`notistack`** — toast notifications

## Features

1. **Wardrobe Gallery** — grid of every uploaded item, filter by category from
   the sidebar.
2. **Smart Upload** — drag-and-drop multiple photos. Each one is:
   - compressed to WebP under ~100 KB,
   - written to the browser's IndexedDB (keyed by a UUID we generate),
   - sent to Gemini for auto-tagging (`category`, `color`, `style`, `material`,
     `vibe`),
   - persisted as a Postgres row using the **same UUID** as primary key.
3. **Dress Me** — pick an occasion (or type a custom one), Gemini composes a
   complete outfit using only the items in your closet.
4. **Match My Selection** — select 1 or 2 specific items, Gemini completes the
   look from your remaining wardrobe.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Provision Supabase (free tier)

1. Create a project at [app.supabase.com](https://app.supabase.com).
2. Open the SQL editor and run [`supabase/schema.sql`](./supabase/schema.sql).
   It creates the `wardrobe` table (just metadata, no image columns) and an
   open RLS policy for the demo single-user setup.
3. *(No Storage bucket needed — images live in IndexedDB.)*
4. Grab from *Project Settings → API*:
   - `Project URL`
   - `anon public` key
   - `service_role` key (server-only)

### 3. Get a Gemini API key

Visit [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).
The free tier of `gemini-2.5-flash` covers ~10–15 requests/min — plenty for
personal use. To override the model, set `GEMINI_MODEL=gemini-2.0-flash` (or
`gemini-flash-latest`) in `.env.local`.

### 4. Configure environment

Copy `.env.local.example` → `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
```

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start uploading clothes.

## Project Layout

```
src/
  app/
    layout.tsx              # Root layout + MUI Providers + AppShell
    page.tsx                # /  -> Wardrobe gallery
    upload/page.tsx         # /upload -> multi-file upload + IDB store + Gemini tagging
    dress-me/page.tsx       # /dress-me -> occasion-based outfit
    match/page.tsx          # /match -> complete-the-look
    api/
      analyze/route.ts      # POST: image -> Gemini -> tags JSON
      wardrobe/route.ts     # GET/POST/DELETE wardrobe metadata (no image bytes)
      dress-me/route.ts     # POST: occasion -> Gemini -> outfit ids
      match/route.ts        # POST: chosen ids -> Gemini -> completed outfit ids
  components/
    providers.tsx           # MUI ThemeProvider + Snackbar
    app-shell.tsx           # Drawer sidebar + AppBar
    wardrobe-grid.tsx       # Responsive grid of item cards
    item-card.tsx           # Card; pulls preview from IndexedDB by id
    outfit-display.tsx      # Outfit panel; pulls previews from IndexedDB
  lib/
    supabase/client.ts      # Browser Supabase client
    supabase/server.ts      # Server (service role) Supabase client
    gemini.ts               # Gemini model + JSON parser
    idb.ts                  # IndexedDB wrapper for image blobs
    use-local-image.ts      # React hook: id -> object URL (with cleanup)
    use-delete-item.ts      # React hook: shared delete flow (toast + cleanup)
    device-id.ts            # Anonymous per-browser identity (localStorage)
    user-id.ts              # Server-side: read device id from request header
    api-client.ts           # fetch() wrapper that attaches x-device-id
    constants.ts            # CATEGORIES, OCCASIONS
    types.ts                # WardrobeItem, AnalyzedTags, OutfitSuggestion
    theme.ts                # MUI theme
supabase/
  schema.sql                # Database schema (metadata only) + RLS
.env.local.example
```

## Identity model

There's no login screen. Instead, every browser gets a random UUID on first
visit (stored in `localStorage` as `fitcheck_device_id`) and sends it on every
API call via the `x-device-id` header. The server uses that value as the
`user_id` for the Supabase `wardrobe` row.

Trade-offs:

- Clearing browser storage = losing your wardrobe rows (the images in
  IndexedDB will also be cleared, so this is consistent at least).
- No cross-device sync — phone + laptop are two separate closets.
- The id is not a secret, so anyone who knows it can read those rows over the
  API; the actual image bytes never leave the original browser.

Upgrading to real auth later only requires swapping `getDeviceUserId(req)`
in `src/lib/user-id.ts` for `auth.uid()` and tightening the RLS policy:

```sql
create policy "wardrobe_owner" on public.wardrobe
  for all using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);
```

### Visitor count

A separate `visitors` table tracks unique device ids. On first page load the
app posts to `/api/visitors/ping` (guarded by `sessionStorage` so we only ping
once per tab) which upserts the device id with `last_seen = now()`. The
sidebar footer reads `/api/visitors/count` to show "N stylists have tried
FitCheck".

## Notes

- **Free tier discipline:** Uploads are processed sequentially to stay under
  Gemini's rate limit. Compressing to ~100 KB WebP keeps the inline image
  payload Gemini receives small.
- **Resilience:** if `/api/wardrobe` save fails after writing to IndexedDB, the
  upload page automatically deletes the orphaned local blob.
- **No Storage CORS to worry about** since the browser is the only thing
  reading and writing image bytes.
