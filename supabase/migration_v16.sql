-- ============================================================
-- RemoteJobs44 — Migration v16
-- Closes audit finding C-2: the direct-Supabase-REST anon-key leak
-- of apply_url and apply_email.
--
-- BEFORE this migration:
--   The Next.js layer (lib/auth/requester-plan.ts) scrubs apply_url
--   and apply_email from /api/jobs, /jobs SSR, and /jobs/[id] SSR
--   responses for anon + free callers. But a scraper can bypass the
--   Next.js layer entirely:
--
--     curl 'https://<ref>.supabase.co/rest/v1/jobs?select=*' \
--          -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>"
--
--   That request lands at PostgREST with the anon role, hits the
--   public-SELECT RLS policy (is_active=true), and returns the full
--   row including apply_url. The Pro paywall is bypassed.
--
-- AFTER this migration:
--   1. Anon and authenticated roles lose SELECT permission on the
--      apply_url + apply_email columns of public.jobs. PostgREST
--      returns 403 "permission denied for column apply_url" when a
--      direct anon/authenticated request asks for them.
--   2. Every OTHER column of public.jobs is re-granted to those roles
--      (the column-level revoke above collapses the coarse SELECT
--      grant — without the re-grant, anon would have NO column access
--      and the entire jobs feed would 403).
--   3. Service-role retains full access — the admin Supabase client
--      (createAdminSupabaseClient) bypasses the column grants and is
--      what /api/jobs uses to fetch apply_url for paying customers
--      after the plan check.
--
-- DEFENSIVE DESIGN
-- ─────────────────
-- The previous static-column-list version of this migration failed
-- when run on a database whose `jobs` table predated migrations
-- v13/v14/v15 (those added `flagged`, `flagged_reason`, `search_vector`).
-- This rewrite uses information_schema introspection to build the safe
-- column list dynamically, so it runs on ANY shape of the jobs table
-- — base setup.sql only, or every migration applied. The only required
-- columns are apply_url + apply_email; everything else is enumerated
-- on-the-fly.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ─── Prereq: anon needs EXECUTE on is_admin() ────────────────────
-- The "Admins can manage jobs" RLS policy on public.jobs calls
-- is_admin(auth.uid()). When anon hits any SELECT, Postgres evaluates
-- every SELECT policy — and the admin policy's call to is_admin throws
-- "permission denied for function is_admin" because the function was
-- only granted to authenticated + service_role originally. The whole
-- query then 401s before column-level grants are even considered.
--
-- is_admin is SECURITY DEFINER and returns false for anon (auth.uid()
-- is null), so the admin policy still correctly does NOT match anon
-- queries — it just runs cleanly instead of erroring out.
grant execute on function public.is_admin(uuid) to anon;

do $$
declare
  has_apply_url    boolean;
  has_apply_email  boolean;
  safe_cols        text;   -- comma-separated list of safe columns
begin
  -- ── Guard: bail clearly if the table doesn't exist or apply_url
  --    / apply_email aren't there. The latter pair are the only
  --    required columns; without them there's nothing for this
  --    migration to revoke.
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'jobs'
  ) then
    raise exception 'public.jobs does not exist - run supabase/setup.sql first';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = 'apply_url'
  ) into has_apply_url;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = 'apply_email'
  ) into has_apply_email;

  if not (has_apply_url and has_apply_email) then
    raise exception 'public.jobs is missing apply_url and/or apply_email - schema is older than expected; bring it up to setup.sql before running v16';
  end if;

  -- ── Build the safe-column list: every column on jobs EXCEPT the
  --    two we're revoking. Quoting each identifier defends against
  --    columns whose names ever collide with a reserved word.
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
  into safe_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name   = 'jobs'
    and column_name not in ('apply_url', 'apply_email');

  -- ── Revoke the COARSE table-level SELECT first.
  --    Postgres precedence: a table-level GRANT SELECT covers EVERY
  --    column and overrides any column-level REVOKE. Supabase's default
  --    role setup grants the coarse SELECT to both anon + authenticated,
  --    so without this revoke the column-level grants below have no
  --    effect and ?select=apply_url still returns 200.
  --    INSERT/UPDATE/DELETE coarse grants are left alone — RLS row
  --    policies gate those; we only need column-level control over
  --    SELECT.
  execute 'revoke select on public.jobs from anon, authenticated';

  -- ── Re-grant SELECT on every column EXCEPT apply_url + apply_email.
  --    After this, anon and authenticated can read the safe columns
  --    via PostgREST as before. A ?select=* request that includes
  --    apply_url returns 403 with code 42501.
  execute format(
    'grant select (%s) on public.jobs to anon, authenticated',
    safe_cols
  );

  -- ── Service-role keeps full access via Supabase's default role
  --    grants; restated here for self-documenting purposes.
  execute 'grant select on public.jobs to service_role';
end$$;

-- ============================================================
-- VERIFY
-- ============================================================
-- After running this migration, confirm the leak is closed:
--
--   curl -s 'https://<ref>.supabase.co/rest/v1/jobs?select=apply_url&limit=1' \
--        -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>"
--
-- Expected: HTTP 403 with body
--   {"code":"42501","message":"permission denied for column apply_url ..."}
--
-- And confirm normal reads still work:
--
--   curl -s 'https://<ref>.supabase.co/rest/v1/jobs?select=id,title,company&limit=3' \
--        -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>"
--
-- Expected: HTTP 200 with a JSON array of 3 jobs.
-- ============================================================
