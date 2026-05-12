-- Migration: capture a self-reported visitor name on first visit so the
-- operator can see who tried the app in the `visitors` table. Names are
-- restricted to alphabetic characters with single spaces between words
-- (validated both client-side and in the route handler), so the column
-- itself stays a plain text field — no enum, no fancy constraint, just a
-- nullable string.
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard → SQL Editor → New Query.
--   2. Paste this whole file.
--   3. Click Run.
--
-- BACKFILL: existing visitor rows keep name = NULL. Once those devices
-- reload the app, the first-visit dialog will fire (they have no local
-- "name set" flag yet) and their row will be backfilled by the new route.

-- ---------- column ----------
alter table public.visitors
  add column if not exists name text;

-- Optional: a partial index so admin queries like
--   `select * from visitors where name ilike 'nik%'`
-- stay fast even after thousands of rows. The `where name is not null`
-- predicate keeps the index small since most early visitors will be NULL.
create index if not exists visitors_name_idx
  on public.visitors (lower(name))
  where name is not null;

-- ---------- set_visitor_name RPC ----------
-- Why an RPC: the route handler should only need service-role access to
-- the function, never direct table privileges. SECURITY DEFINER lets the
-- function run despite the restrictive RLS on `visitors`. We deliberately
-- DO NOT overwrite an existing name on re-call so re-pings from the same
-- device can't be used to rename someone (the client also short-circuits
-- once a name is in localStorage, but defense-in-depth).
create or replace function public.set_visitor_name(
  p_device_id text,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ensure a row exists for this device. We mirror the increment_visitor
  -- pattern so calling set_visitor_name before the user has been pinged
  -- (e.g. if the name dialog races the ping) still produces a clean row.
  insert into public.visitors (device_id, first_seen, last_seen, visits, name)
  values (p_device_id, now(), now(), 1, p_name)
  on conflict (device_id) do update
    set name = coalesce(public.visitors.name, excluded.name),
        last_seen = excluded.last_seen;
end;
$$;

revoke all on function public.set_visitor_name(text, text) from public;
revoke all on function public.set_visitor_name(text, text) from anon;
revoke all on function public.set_visitor_name(text, text) from authenticated;
grant execute on function public.set_visitor_name(text, text) to service_role;
