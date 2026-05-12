-- Migration: fix visitor `visits` counter so it actually increments on every
-- ping. The original /api/visitors/ping route only set `last_seen = now` on
-- existing rows and seeded `visits = 1` on insert, which left every existing
-- visitor stuck at visits=1 forever.
--
-- Why an RPC: PostgREST's .update() can only pass literal values, so the
-- client can't say `SET visits = visits + 1`. Doing it as a function also
-- collapses the previous two-step (update → maybe insert) flow into one
-- atomic statement, killing the race window where two parallel pings could
-- both miss the existing row and try to insert.
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard → SQL Editor → New Query.
--   2. Paste this whole file.
--   3. Click Run.
--   4. Verify it exists: SELECT proname FROM pg_proc WHERE proname = 'increment_visitor';
--
-- HOW TO TEST (after running the migration AND deploying the new route):
--   - Reload the app a few times from the same browser.
--   - In the Supabase Table Editor, your device_id row should show
--     visits = 2, 3, 4, … on successive reloads, and last_seen should advance.

create or replace function public.increment_visitor(p_device_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.visitors (device_id, first_seen, last_seen, visits)
  values (p_device_id, now(), now(), 1)
  on conflict (device_id) do update
    set last_seen = excluded.last_seen,
        visits = public.visitors.visits + 1;
end;
$$;

-- The function runs as definer (postgres) so it works even with the
-- restrictive RLS policies on `visitors`. We still want the API route's
-- service-role key to be the only thing that can call it from the wire, so
-- grant execute ONLY to service_role. Anon / authenticated stay locked out.
revoke all on function public.increment_visitor(text) from public;
revoke all on function public.increment_visitor(text) from anon;
revoke all on function public.increment_visitor(text) from authenticated;
grant execute on function public.increment_visitor(text) to service_role;
