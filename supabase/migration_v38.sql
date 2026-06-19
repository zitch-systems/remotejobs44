-- ============================================================
-- RemoteJobs44 — Migration v38
-- Run AFTER migration_v37.sql in: Supabase Dashboard → SQL Editor.
--
-- 1) site_settings — the admin portal's singleton settings row (id = 1). The
--    settings API previously fell back to localStorage because this table did
--    not exist; create it so settings persist. Columns use the camelCase names
--    the admin API upserts directly. Adds the new Mobile App controls.
--
-- 2) mobile_devices — one row per (user, platform) so the admin can count how
--    many users are on the mobile app. The app upserts on launch.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- 1) Admin settings singleton -----------------------------------------------
create table if not exists public.site_settings (
  id                     integer primary key default 1,
  "siteName"             text    default 'RemoteJobs44',
  "supportEmail"         text    default 'hello@remotejobs44.com',
  "jobsPerPage"          text    default '12',
  "notifyNewUser"        boolean default true,
  "notifyNewSub"         boolean default true,
  "notifyPayFail"        boolean default true,
  "notifyDailySync"      boolean default false,
  -- Mobile App controls
  "mobileMaintenance"    boolean default false,
  "allowSignups"         boolean default true,
  "mobileMinVersion"     text    default '',
  "mobileBannerText"     text    default '',
  "mobileFreeApplyLimit" text    default '10',
  "jobArchiveDays"       text    default '45',
  updated_at             timestamptz default now(),
  constraint site_settings_singleton check (id = 1)
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;

-- Public clients may read the app-facing controls so the app can honour
-- maintenance mode / announcements / the signup toggle. Writes are service-role
-- only (the admin API), so no insert/update policy is granted to public roles.
alter table public.site_settings enable row level security;
drop policy if exists "settings public read" on public.site_settings;
create policy "settings public read" on public.site_settings for select using (true);
grant select on public.site_settings to anon, authenticated;

-- 2) Mobile device registry --------------------------------------------------
create table if not exists public.mobile_devices (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  platform    text not null, -- 'ios' | 'android'
  app_version text,
  last_seen   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  primary key (user_id, platform)
);

alter table public.mobile_devices enable row level security;
drop policy if exists "own device read" on public.mobile_devices;
drop policy if exists "own device insert" on public.mobile_devices;
drop policy if exists "own device update" on public.mobile_devices;
create policy "own device read" on public.mobile_devices for select using (auth.uid() = user_id);
create policy "own device insert" on public.mobile_devices for insert with check (auth.uid() = user_id);
create policy "own device update" on public.mobile_devices for update using (auth.uid() = user_id);
grant select, insert, update on public.mobile_devices to authenticated;
