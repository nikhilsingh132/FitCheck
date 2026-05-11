-- FitCheck database schema
-- Run this in the Supabase SQL editor.
--
-- Note: Images are stored locally in each browser via IndexedDB.
-- Postgres only stores Gemini's tag metadata, keyed by id.

create extension if not exists "pgcrypto";

create table if not exists public.wardrobe (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id text not null default 'demo-user',
  category text,
  color text,
  style text,
  material text,
  vibe text
);

create index if not exists wardrobe_user_id_idx on public.wardrobe (user_id);
create index if not exists wardrobe_category_idx on public.wardrobe (category);

-- Row Level Security: every access must go through our Next.js API routes,
-- which use the service-role key (RLS-bypassing). The anon key is bundled
-- in the browser by design (NEXT_PUBLIC_…), so if we left RLS open anyone
-- could curl Supabase REST directly and dump/modify these tables.
--
-- Policy strategy: deny everything to the `anon` and `authenticated` roles.
-- The service-role key (used only server-side) bypasses RLS so the API
-- routes keep working. If you ever migrate to Supabase Auth, replace these
-- policies with `auth.uid() = user_id` style checks.
alter table public.wardrobe enable row level security;

drop policy if exists "wardrobe_anon_all" on public.wardrobe;
drop policy if exists "wardrobe_block_anon" on public.wardrobe;
drop policy if exists "wardrobe_block_authenticated" on public.wardrobe;

create policy "wardrobe_block_anon" on public.wardrobe
  as restrictive
  for all
  to anon
  using (false)
  with check (false);

create policy "wardrobe_block_authenticated" on public.wardrobe
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);

-- Visitor tracking: one row per unique browser (anonymous device id).
-- Lets us answer "how many people have tried this?" without a real auth system.
create table if not exists public.visitors (
  device_id text primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  visits integer not null default 1
);

create index if not exists visitors_last_seen_idx on public.visitors (last_seen desc);

alter table public.visitors enable row level security;

drop policy if exists "visitors_anon_all" on public.visitors;
drop policy if exists "visitors_block_anon" on public.visitors;
drop policy if exists "visitors_block_authenticated" on public.visitors;

create policy "visitors_block_anon" on public.visitors
  as restrictive
  for all
  to anon
  using (false)
  with check (false);

create policy "visitors_block_authenticated" on public.visitors
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);
