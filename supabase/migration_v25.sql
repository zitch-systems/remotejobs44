-- ============================================================
-- RemoteJobs44 — Migration v25
-- Run AFTER migration_v24.sql in: Supabase Dashboard → SQL Editor.
--
-- Restores apply_url dedup — reverses migration_v5.
--
-- migration_v5 dropped the unique index on jobs.apply_url and switched
-- every ingest path to plain INSERT. The daily cron then re-inserted a
-- fresh copy of every still-live job on each run, so the table grew to
-- ~237k rows backing only ~34k distinct postings (~85% duplicates) —
-- exactly the outcome that migration warned about. This migration
-- collapses the duplicates and puts the constraint back so the
-- insert→upsert code paths in the same change can dedup at write time.
--
-- Three steps, one transaction:
--   1. Re-point user references (applications, saved_jobs) from the
--      duplicate rows onto the surviving canonical row, first collapsing
--      any (user_id, canonical job) collisions so the existing
--      UNIQUE(user_id, job_id) keys still hold after the re-point.
--   2. Delete the duplicate job rows, keeping one canonical row per
--      apply_url (the FKs are ON DELETE CASCADE, so step 1 must run
--      first or applied/saved rows would be cascade-deleted).
--   3. Re-create the UNIQUE index on jobs(apply_url).
--
-- Canonical row per apply_url = is_active first, then newest
-- (created_at desc, id desc) — keeps a live, freshest representative.
--
-- The index is intentionally NON-partial (unlike migration_v2's
-- `WHERE apply_url IS NOT NULL`): Postgres ON CONFLICT arbiter inference
-- can't use a partial index without restating its predicate, which the
-- supabase-js .upsert({ onConflict: 'apply_url' }) calls can't express.
-- A plain unique index still allows unlimited NULL apply_url rows
-- (NULLs compare distinct), so postings without an apply URL are
-- unaffected.
--
-- ⚠️  Destructive: deletes ~203k duplicate job rows. Idempotent — once
--     the unique index exists a re-run finds nothing to collapse.
-- ============================================================

begin;

-- One-time maintenance delete touches ~203k rows across every index on
-- jobs; lift the statement timeout so it can't be cut off mid-way.
set local statement_timeout = '600s';

-- Map every job row to the canonical survivor for its apply_url.
create temporary table _job_canonical on commit drop as
  select id,
         first_value(id) over (
           partition by apply_url
           order by is_active desc, created_at desc, id desc
         ) as canonical_id
  from public.jobs
  where apply_url is not null;

create index on _job_canonical (id);

-- ── 1a. applications: collapse collisions, then re-point ──────────────
-- A user may have applied to more than one copy of the same posting.
-- Keep the earliest application per (user_id, canonical job) and drop
-- the rest, otherwise the re-point below would violate
-- applications_user_job_unique (user_id, job_id).
delete from public.applications a
using (
  select a.id,
         row_number() over (
           partition by a.user_id, c.canonical_id
           order by a.applied_at asc nulls last, a.id asc
         ) as rn
  from public.applications a
  join _job_canonical c on c.id = a.job_id
) ranked
where a.id = ranked.id
  and ranked.rn > 1;

update public.applications a
set job_id = c.canonical_id
from _job_canonical c
where a.job_id = c.id
  and a.job_id <> c.canonical_id;

-- ── 1b. saved_jobs: same collapse + re-point ─────────────────────────
-- Currently empty, but kept symmetric with applications so the migration
-- stays correct if rows exist when it runs.
delete from public.saved_jobs s
using (
  select s.id,
         row_number() over (
           partition by s.user_id, c.canonical_id
           order by s.id asc
         ) as rn
  from public.saved_jobs s
  join _job_canonical c on c.id = s.job_id
) ranked
where s.id = ranked.id
  and ranked.rn > 1;

update public.saved_jobs s
set job_id = c.canonical_id
from _job_canonical c
where s.job_id = c.id
  and s.job_id <> c.canonical_id;

-- ── 2. Delete duplicate job rows, keeping the canonical survivor ──────
delete from public.jobs j
using _job_canonical c
where j.id = c.id
  and c.id <> c.canonical_id;

-- ── 3. Re-create the unique index dropped in migration_v5 ────────────
create unique index if not exists jobs_apply_url_idx
  on public.jobs(apply_url);

commit;
