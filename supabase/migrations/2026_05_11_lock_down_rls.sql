-- Migration: lock down RLS on wardrobe + visitors so the anon key (which is
-- bundled in the browser by design) cannot read or modify these tables
-- directly.
--
-- HOW TO RUN:
--   1. Open the Supabase Dashboard → SQL Editor → New Query.
--   2. Paste the entire contents of this file.
--   3. Click "Run".
--   4. Verify in the Authentication → Policies tab that wardrobe and
--      visitors each show two RESTRICTIVE policies (anon + authenticated)
--      with USING (false).
--
-- HOW TO VERIFY (optional, run in a new query):
--   set role anon;
--   select count(*) from public.wardrobe;   -- should error: "new row violates row-level security policy" or return 0
--   reset role;
--
-- BACKGROUND: the service-role key used by the Next.js server routes
-- bypasses RLS, so the app keeps working. Only direct REST/curl calls with
-- the public anon key are blocked.

-- ---------- wardrobe ----------
alter table public.wardrobe enable row level security;

-- Remove any pre-existing permissive policies left over from the demo schema.
drop policy if exists "wardrobe_anon_all" on public.wardrobe;
drop policy if exists "wardrobe_block_anon" on public.wardrobe;
drop policy if exists "wardrobe_block_authenticated" on public.wardrobe;

-- "restrictive" policies AND together with any permissive ones; a single
-- USING (false) here is enough to block everything for these roles.
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

-- ---------- visitors ----------
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
