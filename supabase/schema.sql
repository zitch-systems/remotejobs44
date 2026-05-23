-- ============================================================
-- RemoteJobs44 — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── Extensions ────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Users (mirrors Supabase auth.users) ──────────────────
create table if not exists public.profiles (
  id              uuid references auth.users on delete cascade primary key,
  name            text,
  email           text unique not null,
  plan            text not null default 'free' check (plan in ('free','daily','pro','admin')),
  role            text not null default 'user' check (role in ('user','admin')),
  avatar_url      text,
  profile_completion integer default 20,
  paystack_customer_code text,
  paystack_subscription_code text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Jobs ─────────────────────────────────────────────────
create table if not exists public.jobs (
  id              uuid default uuid_generate_v4() primary key,
  title           text not null,
  company         text not null,
  company_id      uuid,
  logo            text,
  category        text not null default 'other',
  type            text not null default 'full-time',
  level           text,
  salary_min      integer,
  salary_max      integer,
  currency        text default 'USD',
  location        text not null default 'Worldwide',
  timezone        text,
  description     text not null default '',
  requirements    text[],
  skills          text[],
  benefits        text[],
  apply_url       text,
  apply_email     text,
  posted_at       timestamptz default now(),
  expires_at      timestamptz,
  featured        boolean default false,
  is_new          boolean default true,
  is_active       boolean default true,
  source          text default 'manual',
  source_url      text,
  views           integer default 0,
  applications    integer default 0,
  remote          boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── Saved Jobs ────────────────────────────────────────────
create table if not exists public.saved_jobs (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  job_id     uuid references public.jobs(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, job_id)
);

-- ── Applications ──────────────────────────────────────────
create table if not exists public.applications (
  id              uuid default uuid_generate_v4() primary key,
  user_id         uuid references public.profiles(id) on delete cascade not null,
  job_id          uuid references public.jobs(id) on delete cascade not null,
  job_title       text not null,
  company         text not null,
  company_logo    text,
  status          text not null default 'applied' check (status in ('applied','screening','interview','offer','rejected','withdrawn')),
  applied_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  notes           text,
  auto_applied    boolean default false,
  steps           jsonb default '[]'::jsonb
);

-- ── Job Sources ───────────────────────────────────────────
create table if not exists public.job_sources (
  id            uuid default uuid_generate_v4() primary key,
  name          text not null,
  url           text not null unique,
  method        text not null default 'rss',
  status        text not null default 'active' check (status in ('active','error','pending','disabled')),
  last_sync_at  timestamptz,
  jobs_added    integer default 0,
  jobs_updated  integer default 0,
  sync_interval integer default 60,
  error_message text,
  created_at    timestamptz default now()
);

-- ── Subscriptions ─────────────────────────────────────────
create table if not exists public.subscriptions (
  id                         uuid default uuid_generate_v4() primary key,
  user_id                    uuid references public.profiles(id) on delete cascade not null unique,
  plan                       text not null default 'free',
  billing                    text default 'monthly' check (billing in ('daily','monthly','annually')),
  price                      numeric(10,2),
  currency                   text default 'NGN',
  status                     text default 'active' check (status in ('active','cancelled','past_due','expired')),
  paystack_customer_code     text,
  paystack_subscription_code text,
  paystack_plan_code         text,
  current_period_start       timestamptz,
  current_period_end         timestamptz,
  created_at                 timestamptz default now(),
  updated_at                 timestamptz default now()
);

-- ── Row Level Security ────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.applications enable row level security;
alter table public.subscriptions enable row level security;
alter table public.job_sources enable row level security;

-- Profiles: users see/edit only their own
create policy "profiles_select" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- Jobs: everyone can read active jobs; only admins can insert/update/delete
create policy "jobs_select" on public.jobs for select using (is_active = true);
create policy "jobs_insert" on public.jobs for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "jobs_update" on public.jobs for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- Saved jobs: users manage their own
create policy "saved_select" on public.saved_jobs for select using (auth.uid() = user_id);
create policy "saved_insert" on public.saved_jobs for insert with check (auth.uid() = user_id);
create policy "saved_delete" on public.saved_jobs for delete using (auth.uid() = user_id);

-- Applications: users see their own
create policy "apps_select" on public.applications for select using (auth.uid() = user_id);
create policy "apps_insert" on public.applications for insert with check (auth.uid() = user_id);
create policy "apps_update" on public.applications for update using (auth.uid() = user_id);

-- Subscriptions: users see their own
create policy "subs_select" on public.subscriptions for select using (auth.uid() = user_id);

-- Job sources: only admins
create policy "sources_all" on public.job_sources for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ── Indexes ───────────────────────────────────────────────
create index if not exists jobs_category_idx on public.jobs(category);
create index if not exists jobs_posted_at_idx on public.jobs(posted_at desc);
create index if not exists jobs_featured_idx on public.jobs(featured);
create index if not exists jobs_is_active_idx on public.jobs(is_active);
create index if not exists applications_user_id_idx on public.applications(user_id);
create index if not exists saved_jobs_user_id_idx on public.saved_jobs(user_id);

-- ── Updated_at trigger ────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger jobs_updated_at before update on public.jobs for each row execute function public.set_updated_at();
create trigger applications_updated_at before update on public.applicatio