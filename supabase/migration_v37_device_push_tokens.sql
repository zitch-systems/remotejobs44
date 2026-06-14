-- migration_v37_device_push_tokens.sql
-- Device push tokens for the mobile app's job-alert notifications.
-- The mobile client (mobile/src/lib/push.ts) upserts the device's Expo push
-- token here; a server-side sender (edge function / cron) reads these with the
-- service role to deliver alerts via Expo's push API.

create table if not exists public.device_push_tokens (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  token      text not null unique,
  platform   text not null default 'ios' check (platform in ('ios', 'android', 'web')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_device_push_tokens_user on public.device_push_tokens(user_id);

alter table public.device_push_tokens enable row level security;

-- Each user can read/insert/update/delete only their own device tokens. The
-- service role (the push sender) bypasses RLS, so it can read every token.
drop policy if exists "Users manage own push tokens" on public.device_push_tokens;
create policy "Users manage own push tokens"
  on public.device_push_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
