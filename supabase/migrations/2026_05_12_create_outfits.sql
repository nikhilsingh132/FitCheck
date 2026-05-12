-- Migration: create the `outfits` table for per-day outfit history, and
-- lock it down with restrictive RLS so the anon key (which is bundled in
-- the browser by design) cannot read or modify it directly. All reads /
-- writes go through the Next.js API routes which use the service-role key
-- and bypass RLS.
--
-- HOW TO RUN:
--   1. Open the Supabase Dashboard → SQL Editor → New Query.
--   2. Paste the entire contents of this file.
--   3. Click "Run".
--   4. Verify in the Authentication → Policies tab that `outfits` shows
--      two RESTRICTIVE policies (anon + authenticated) with USING (false).
--
-- DATA MODEL NOTES:
--   - One row per generated outfit (Dress Me or Match).
--   - `item_ids` is a uuid[] referencing wardrobe.id values, *without* a FK
--     constraint on purpose: deleting a wardrobe item shouldn't blow away
--     the history rows that reference it. The /api/outfits GET route filters
--     out missing ids at read time so the UI renders a graceful "removed
--     piece" placeholder instead of a broken card.
--   - We DON'T copy item tags into the outfit row. Wardrobe rows are small
--     and we already fetch them on /history, so denormalizing would only
--     duplicate data and risk drift if the user re-tags items.

-- ---------- outfits ----------
create table if not exists public.outfits (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  created_at    timestamptz not null default now(),
  source        text not null check (source in ('dress-me', 'match')),
  occasion      text,                  -- nullable for Match (no occasion concept)
  vibe          text,
  reasoning     text,
  item_ids      uuid[] not null default '{}'
);

-- History queries are always "give me my outfits, newest first".
-- A composite index on (user_id, created_at desc) keeps that O(log n)
-- even as the table grows.
create index if not exists outfits_user_created_idx
  on public.outfits (user_id, created_at desc);

alter table public.outfits enable row level security;

-- Remove any pre-existing permissive policies left over from earlier runs.
drop policy if exists "outfits_anon_all" on public.outfits;
drop policy if exists "outfits_block_anon" on public.outfits;
drop policy if exists "outfits_block_authenticated" on public.outfits;

-- Restrictive policies AND together with any permissive ones; a single
-- USING (false) per role is enough to block everything for that role.
-- Service-role key (used by the Next.js server routes) bypasses RLS, so
-- the app continues to work.
create policy "outfits_block_anon" on public.outfits
  as restrictive
  for all
  to anon
  using (false)
  with check (false);

create policy "outfits_block_authenticated" on public.outfits
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);
