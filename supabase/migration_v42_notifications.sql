-- migration_v42_notifications.sql
-- In-app notification inbox. Server-generated rows (job alerts from the
-- send-job-alerts function, application updates, system messages); the mobile
-- app reads them and marks them read. RLS: a user sees + updates only their own;
-- inserts are done server-side with the service role.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'job_alert' check (type in ('job_alert', 'application', 'system')),
  title text not null,
  body text,
  job_id uuid references public.jobs(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
