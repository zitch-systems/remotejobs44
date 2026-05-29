-- ============================================================
-- RemoteJobs44 — Catch-up migration: v9 through v16, in one file
-- ============================================================
--
-- WHO THIS IS FOR
-- ---------------
-- A Supabase project whose `jobs` table exists (so setup.sql / the
-- bootstrap schema has been applied) but is missing one or more of the
-- recent additions:
--
--   v9   — column-level UPDATE lockdown on profiles
--          (without it, any authed user can self-promote to admin via
--          the browser console — high-severity privilege escalation)
--   v10  — profiles.plan_expires_at + backfill + index
--          (without it, plan expiry checks always pass; paying users
--          keep access forever, Day Passes never lapse)
--   v11  — jobs.flagged + jobs.flagged_reason + index
--          (without it, the public listing's `.or(NOT_FLAGGED)` filter
--          fails at query time)
--   v12  — partial index on jobs.expires_at
--          (without it, the visibility filter does a seq scan — slow
--          but not broken)
--   v13  — paystack_webhook_events table for replay protection
--          (without it, replayed Paystack webhooks re-process — a
--          payment-failed email goes out every retry)
--   v14  — cron_locks table + try_acquire_cron_lock RPC
--          (without it, parallel ingest runs collide — duplicate-row
--          explosion in the jobs table)
--   v15  — jobs.search_vector tsvector column + GIN index
--          (without it, /api/jobs?q=… and /jobs?q=… textSearch calls
--          fail because the column doesn't exist)
--   v16  — column-level revoke on apply_url + apply_email
--          (closes audit finding C-2: scraper using the anon key
--          could read off-site apply URLs via direct Supabase REST)
--
-- WHAT THIS FILE DOES
-- -------------------
-- Runs every migration above, in order. Every section is idempotent
-- (uses IF NOT EXISTS, OR REPLACE, or runtime introspection), so it
-- is safe to apply on a project that already has any subset of these
-- migrations. Re-running the whole file is a no-op.
--
-- HOW TO RUN
-- ----------
-- Supabase Dashboard → SQL Editor → New Query → paste this file →
-- Run. Watch the output: each section emits a NOTICE when it runs.
-- Expected total time: <5 seconds on a small jobs table, up to ~30 s
-- if v15's tsvector backfill has to populate many rows.
-- ============================================================


-- ──────────────────────────────────────────────────────────────────
-- v9. Column-level UPDATE lockdown on public.profiles
-- ──────────────────────────────────────────────────────────────────
-- Without this, an authed user could open the browser console and run:
--   supabase.from('profiles').update({ role: 'admin', plan: 'pro' }).eq('id', uid)
-- and self-elevate. We revoke blanket UPDATE from `authenticated` and
-- re-grant only the columns users may legitimately edit (name +
-- updated_at). Everything else has to go through a server route using
-- the service-role client.

revoke update on public.profiles from authenticated;
grant update (name, updated_at) on public.profiles to authenticated;


-- ──────────────────────────────────────────────────────────────────
-- v10. profiles.plan_expires_at + backfill + index
-- ──────────────────────────────────────────────────────────────────
-- The whole effective-plan/expiry-check pipeline (resolvePlan, the
-- daily expire cron, /api/applications gate, the Header plan badge,
-- /api/profile) reads this column. Without it, every expiry check
-- returns "no expiry → trust DB plan" and paid users keep access
-- forever.

alter table public.profiles
  add column if not exists plan_expires_at timestamptz;

-- Backfill from the authoritative subscriptions table. Writes only
-- when the new value is strictly greater than the existing one — so
-- re-runs are no-ops.
update public.profiles p
   set plan_expires_at = sub.latest_end
  from (
    select user_id, max(current_period_end) as latest_end
      from public.subscriptions
     where status = 'active'
     group by user_id
  ) sub
 where p.id = sub.user_id
   and (p.plan_expires_at is null or sub.latest_end > p.plan_expires_at);

-- Partial index for the cron's "find expired" sweep. Only non-null
-- rows are indexed.
create index if not exists profiles_plan_expires_at_idx
  on public.profiles(plan_expires_at)
  where plan_expires_at is not null;


-- ──────────────────────────────────────────────────────────────────
-- v11. jobs.flagged + jobs.flagged_reason for scam-pattern triage
-- ──────────────────────────────────────────────────────────────────
-- Ingestion pulls verbatim from Remotive / Jobicy / RemoteOK / SerpApi
-- / Findwork and also accepts LLM-generated jobs from /api/admin/
-- ai-discovery. lib/scam-detect.ts marks suspicious rows; admin
-- moderation at /admin/jobs sweeps them. Public listing queries filter
-- via .or('flagged.eq.false,flagged.is.null') — without these columns
-- the filter throws "column does not exist".

alter table public.jobs
  add column if not exists flagged boolean not null default false,
  add column if not exists flagged_reason text;

create index if not exists jobs_flagged_idx
  on public.jobs(flagged)
  where flagged = true;


-- ──────────────────────────────────────────────────────────────────
-- v12. Partial index on jobs.expires_at
-- ──────────────────────────────────────────────────────────────────
-- Speeds up the visibility filter
--   .or('expires_at.is.null,expires_at.gt.now')
-- that every public read runs. Most ATS upstreams don't ship
-- expires_at so the partial keeps it tiny.

create index if not exists jobs_expires_at_idx
  on public.jobs(expires_at)
  where expires_at is not null;


-- ──────────────────────────────────────────────────────────────────
-- v13. paystack_webhook_events for generic webhook idempotency
-- ──────────────────────────────────────────────────────────────────
-- Replayed Paystack events (5xx retries, network glitches) without
-- a dedup log get processed twice — a payment-failed event re-emails
-- the user every time. We dedup by (event_type, paystack_id) — a
-- unique index does the work; the handler catches the violation as
-- "already processed, short-circuit".

create table if not exists public.paystack_webhook_events (
  id           uuid default gen_random_uuid() primary key,
  event_type   text not null,
  paystack_id  text not null,
  payload      jsonb,
  received_at  timestamptz default now() not null,
  processed    boolean default true not null
);

create unique index if not exists paystack_webhook_events_dedup_idx
  on public.paystack_webhook_events(event_type, paystack_id);

create index if not exists paystack_webhook_events_received_at_idx
  on public.paystack_webhook_events(received_at desc);

alter table public.paystack_webhook_events enable row level security;

drop policy if exists paystack_webhook_events_admin_select on public.paystack_webhook_events;
create policy paystack_webhook_events_admin_select
  on public.paystack_webhook_events for select
  using ( public.is_admin(auth.uid()) );


-- ──────────────────────────────────────────────────────────────────
-- v14. cron_locks + try_acquire_cron_lock + release_cron_lock
-- ──────────────────────────────────────────────────────────────────
-- runIngest() is callable from /api/cron/daily, /api/cron/ingest, AND
-- /api/admin/ingest-now. Without a lock, an admin clicking "Run now"
-- while the daily cron is mid-run causes parallel ingestions to
-- double-insert every upstream job. Worse: each subsequent collision
-- compounds, so the jobs table inflates geometrically.

create table if not exists public.cron_locks (
  name         text primary key,
  acquired_at  timestamptz not null default now(),
  expires_at   timestamptz not null
);

alter table public.cron_locks enable row level security;

drop policy if exists cron_locks_service_role on public.cron_locks;
create policy cron_locks_service_role
  on public.cron_locks for all
  using ( auth.role() = 'service_role' );

-- Atomic acquire. Returns true when the caller now holds the lock.
create or replace function public.try_acquire_cron_lock(lock_name text, ttl_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean := false;
begin
  insert into public.cron_locks (name, acquired_at, expires_at)
    values (lock_name, now(), now() + (ttl_seconds || ' seconds')::interval)
    on conflict (name) do update
      set acquired_at = excluded.acquired_at,
          expires_at  = excluded.expires_at
      where public.cron_locks.expires_at < now()
    returning true into acquired;
  return coalesce(acquired, false);
end;
$$;

revoke all on function public.try_acquire_cron_lock(text, int) from public;
grant execute on function public.try_acquire_cron_lock(text, int) to service_role;

create or replace function public.release_cron_lock(lock_name text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.cron_locks where name = lock_name;
$$;

revoke all on function public.release_cron_lock(text) from public;
grant execute on function public.release_cron_lock(text) to service_role;


-- ──────────────────────────────────────────────────────────────────
-- v15. jobs.search_vector tsvector + GIN index + trigram indexes
-- ──────────────────────────────────────────────────────────────────
-- /api/jobs and /jobs use .textSearch('search_vector', q, { type:
-- 'websearch' }). Without this column the query throws "column does
-- not exist". GIN-indexed; weighted A/B/C (title > company >
-- description). Trigram indexes accelerate the landing-page ILIKE
-- filters too.

alter table public.jobs
  add column if not exists search_vector tsvector
    generated always as (
      setweight(to_tsvector('english', coalesce(title,       '')), 'A') ||
      setweight(to_tsvector('english', coalesce(company,     '')), 'B') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'C')
    ) stored;

create index if not exists jobs_search_vector_idx
  on public.jobs using gin (search_vector);

create extension if not exists pg_trgm;

create index if not exists jobs_location_trgm_idx
  on public.jobs using gin (location gin_trgm_ops);

create index if not exists jobs_title_trgm_idx
  on public.jobs using gin (title gin_trgm_ops);

create index if not exists jobs_company_trgm_idx
  on public.jobs using gin (company gin_trgm_ops);


-- ──────────────────────────────────────────────────────────────────
-- v16-prereq. Grant anon EXECUTE on is_admin().
-- ──────────────────────────────────────────────────────────────────
-- The jobs RLS policy "Admins can manage jobs" calls is_admin(auth.uid()).
-- When anon hits SELECT on public.jobs, Postgres evaluates EVERY SELECT
-- policy (they're OR'd) — and the admin policy's call to is_admin throws
-- "permission denied for function is_admin" because the function was
-- originally granted only to authenticated + service_role. The whole
-- query then 401s before column-level grants are even considered.
--
-- Granting anon EXECUTE is safe: is_admin is SECURITY DEFINER and returns
-- false for anon (auth.uid() is null, no profiles row matches), so the
-- admin policy correctly does NOT match — but the function runs cleanly
-- instead of erroring out.
grant execute on function public.is_admin(uuid) to anon;


-- ──────────────────────────────────────────────────────────────────
-- v16. Column-level revoke on apply_url + apply_email
-- ──────────────────────────────────────────────────────────────────
-- Closes audit finding C-2: a scraper hitting Supabase REST directly
-- with the anon key could read off-site apply URLs, bypassing the
-- Next.js app-layer scrub.
--
-- After this section, direct anon/authenticated REST queries that
-- mention apply_url or apply_email return 403. The Next.js code uses
-- service-role for paying users (which bypasses column grants) so
-- legitimate access keeps working.
--
-- Defensive: builds the safe-column list at runtime via
-- information_schema, so it adapts to whatever shape the jobs table
-- has by this point (including the v11 + v15 columns added above, or
-- the absence of any of them).

do $$
declare
  has_apply_url    boolean;
  has_apply_email  boolean;
  safe_cols        text;
begin
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
    raise exception 'public.jobs is missing apply_url and/or apply_email - schema is older than expected';
  end if;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
  into safe_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name   = 'jobs'
    and column_name not in ('apply_url', 'apply_email');

  -- Revoke the COARSE table-level SELECT first — a table-level GRANT
  -- SELECT covers every column and overrides column-level revokes.
  -- Without this revoke, ?select=apply_url still returns 200.
  execute 'revoke select on public.jobs from anon, authenticated';

  -- Re-grant SELECT on every column EXCEPT apply_url + apply_email.
  -- INSERT/UPDATE/DELETE coarse grants are left alone — those are
  -- governed by RLS policies.
  execute format(
    'grant select (%s) on public.jobs to anon, authenticated',
    safe_cols
  );

  execute 'grant select on public.jobs to service_role';
end$$;


-- ============================================================
-- DONE.
-- ============================================================
-- Verify the C-2 leak is closed:
--
--   curl -s 'https://<ref>.supabase.co/rest/v1/jobs?select=apply_url&limit=1' \
--        -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>"
--
-- Expected: HTTP 403 with body
--   {"code":"42501","message":"permission denied for column apply_url ..."}
--
-- And confirm the listing endpoint still works:
--
--   curl -s 'https://<ref>.supabase.co/rest/v1/jobs?select=id,title,company&limit=3' \
--        -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>"
--
-- Expected: HTTP 200 with a JSON array of 3 jobs.
-- ============================================================
