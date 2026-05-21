-- ============================================================
-- RemoteJobs44 — Full Database Setup
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. PROFILES
-- ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  name                text,
  email               text,
  plan                text not null default 'free'
                        check (plan in ('free','daily','pro','admin')),
  role                text not null default 'user'
                        check (role in ('user','admin')),
  profile_completion  int  not null default 20,
  cv_url              text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Policies
drop policy if exists "Users can view own profile"                on public.profiles;
drop policy if exists "Users can update own profile"              on public.profiles;
drop policy if exists "Admins can view all profiles"              on public.profiles;
drop policy if exists "Admins can update all profiles"            on public.profiles;
drop policy if exists "Service role full access to profiles"      on public.profiles;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Admins can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can update all profiles"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Service role bypass (for API routes using service key)
create policy "Service role full access to profiles"
  on public.profiles for all
  using (auth.role() = 'service_role');

-- Auto-create profile on signup trigger
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, plan, role, profile_completion)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'free',
    'user',
    20
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Updated_at auto-update
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();


-- ────────────────────────────────────────────────────────────
-- 2. JOBS
-- ────────────────────────────────────────────────────────────
create table if not exists public.jobs (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  company      text not null,
  company_id   uuid,
  logo         text,
  category     text,
  type         text default 'full-time',
  level        text,
  location     text default 'Worldwide',
  timezone     text,
  description  text,
  requirements text,
  skills       text[],
  benefits     text[],
  apply_url    text unique,
  apply_email  text,
  salary_min   numeric,
  salary_max   numeric,
  currency     text default 'USD',
  remote       boolean not null default true,
  featured     boolean not null default false,
  is_new       boolean not null default true,
  is_active    boolean not null default true,
  source       text default 'manual',
  source_url   text,
  views        int not null default 0,
  applications int not null default 0,
  posted_at    timestamptz not null default now(),
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.jobs enable row level security;

drop policy if exists "Jobs are publicly readable" on public.jobs;
drop policy if exists "Admins can manage jobs"     on public.jobs;
drop policy if exists "Service role full access to jobs" on public.jobs;

create policy "Jobs are publicly readable"
  on public.jobs for select
  using (is_active = true);

create policy "Admins can manage jobs"
  on public.jobs for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Service role full access to jobs"
  on public.jobs for all
  using (auth.role() = 'service_role');

create index if not exists jobs_posted_at_idx   on public.jobs(posted_at desc);
create index if not exists jobs_category_idx    on public.jobs(category);
create index if not exists jobs_is_active_idx   on public.jobs(is_active);
create index if not exists jobs_featured_idx    on public.jobs(featured desc);


-- ────────────────────────────────────────────────────────────
-- 3. SUBSCRIPTIONS
-- ────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references public.profiles(id) on delete cascade,
  plan                        text not null default 'free'
                                check (plan in ('free','daily','pro')),
  billing                     text default 'monthly'
                                check (billing in ('daily','monthly','annually')),
  status                      text not null default 'active'
                                check (status in ('active','cancelled','expired','past_due')),
  paystack_subscription_code  text,
  paystack_customer_code      text,
  current_period_start        timestamptz default now(),
  current_period_end          timestamptz,
  currency                    text default 'NGN',
  price                       numeric default 0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (user_id)
);

alter table public.subscriptions enable row level security;

drop policy if exists "Users can view own subscription"   on public.subscriptions;
drop policy if exists "Admins can view all subscriptions" on public.subscriptions;
drop policy if exists "Service role full access to subscriptions" on public.subscriptions;

create policy "Users can view own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create policy "Admins can view all subscriptions"
  on public.subscriptions for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Service role full access to subscriptions"
  on public.subscriptions for all
  using (auth.role() = 'service_role');

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute procedure public.set_updated_at();


-- ────────────────────────────────────────────────────────────
-- 4. JOB ALERTS
-- ────────────────────────────────────────────────────────────
create table if not exists public.job_alerts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  category   text,
  keywords   text,
  frequency  text not null default 'daily'
               check (frequency in ('daily','weekly')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.job_alerts enable row level security;

drop policy if exists "Users manage own alerts" on public.job_alerts;
drop policy if exists "Service role full access to job_alerts" on public.job_alerts;

create policy "Users manage own alerts"
  on public.job_alerts for all
  using (auth.uid() = user_id);

create policy "Service role full access to job_alerts"
  on public.job_alerts for all
  using (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────
-- 5. JOB SOURCES
-- ────────────────────────────────────────────────────────────
create table if not exists public.job_sources (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  url          text not null unique,
  method       text default 'json-api',
  status       text default 'active'
                 check (status in ('active','error','paused')),
  last_sync_at timestamptz,
  jobs_added   int default 0,
  created_at   timestamptz not null default now()
);

alter table public.job_sources enable row level security;

drop policy if exists "Admins can manage job_sources" on public.job_sources;
drop policy if exists "Service role full access to job_sources" on public.job_sources;

create policy "Admins can manage job_sources"
  on public.job_sources for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Service role full access to job_sources"
  on public.job_sources for all
  using (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────
-- 6. STORAGE BUCKET — CVs
-- ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do nothing;

drop policy if exists "Users can upload own CV"  on storage.objects;
drop policy if exists "Users can read own CV"    on storage.objects;
drop policy if exists "Users can delete own CV"  on storage.objects;

create policy "Users can upload own CV"
  on storage.objects for insert
  with check (bucket_id = 'cvs' and auth.uid()::text = split_part(name, '/', 1));

create policy "Users can read own CV"
  on storage.objects for select
  using (bucket_id = 'cvs' and auth.uid()::text = split_part(name, '/', 1));

create policy "Users can delete own CV"
  on storage.objects for delete
  using (bucket_id = 'cvs' and auth.uid()::text = split_part(name, '/', 1));


-- ────────────────────────────────────────────────────────────
-- 7. MAKE YOUR ACCOUNT ADMIN
--    Replace the email below with YOUR email address
-- ────────────────────────────────────────────────────────────
update public.profiles
set role = 'admin', plan = 'admin'
where email = 'mallamplacid@gmail.com';

-- ────────────────────────────────────────────────────────────
-- DONE ✓
-- After running this script:
-- 1. Go to Authentication → Providers → Email
--    → Disable "Confirm email" for instant login
-- 2. Log in at /login — you'll land on /admin automatically
-- ────────────────────────────────────────────────────────────
