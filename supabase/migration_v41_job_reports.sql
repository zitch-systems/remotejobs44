-- migration_v41_job_reports.sql
-- User reports of problematic job listings (scam, spam, expired, offensive…).
-- Mobile: app/job/[id].tsx → components/ReportSheet → lib/report.ts. RLS mirrors
-- saved_jobs: a signed-in user can file + read their own reports; moderation
-- reads with the service role.
create table if not exists public.job_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  reason text not null check (reason in ('scam', 'spam', 'expired', 'inaccurate', 'offensive', 'other')),
  details text,
  created_at timestamptz not null default now()
);

create index if not exists job_reports_job_idx on public.job_reports (job_id);
create index if not exists job_reports_user_idx on public.job_reports (user_id);

alter table public.job_reports enable row level security;

drop policy if exists "job_reports_insert_own" on public.job_reports;
create policy "job_reports_insert_own" on public.job_reports for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "job_reports_select_own" on public.job_reports;
create policy "job_reports_select_own" on public.job_reports for select to authenticated
  using ((select auth.uid()) = user_id);
