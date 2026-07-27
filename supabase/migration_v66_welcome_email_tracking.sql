-- migration_v66_welcome_email_tracking.sql
--
-- Makes the welcome email idempotent and reliable.
--
-- Before this, /auth/callback decided "is this the user's first login?" by
-- comparing auth.users.created_at against last_sign_in_at and treating a gap
-- of under 30 seconds as "first". For a Google sign-in those two timestamps
-- are written together, so it worked. For an email signup they are NOT: the
-- row is created when the form is submitted, and last_sign_in_at is only
-- written when the user clicks the link in their inbox. The gap is therefore
-- the user's time-to-open-inbox, and the median for this project is ~41s —
-- above the 30s window. 101 of 149 confirmed email signups (68%) fell outside
-- it and were never sent a welcome email.
--
-- The second half of the same bug: app/api/profile/route.ts also sends the
-- welcome email, but only on the branch where the profile row is MISSING.
-- The on_auth_user_created trigger has created that row at signup since
-- migration_v3, so the branch is unreachable for anyone who signed up after
-- it landed — the fallback could never fire.
--
-- Fix: record delivery on the row itself. lib/email/welcome.ts claims the
-- column with a conditional UPDATE (… WHERE welcome_email_sent_at IS NULL),
-- which is atomic in Postgres, so concurrent callers can't double-send and a
-- failed send releases the claim for the next attempt.
--
-- BACKFILL NOTE: every profile that exists when this runs is stamped as
-- already-welcomed. That deliberately does NOT retro-send to the 123 users the
-- old heuristic skipped — a "Welcome to RemoteJobs44" landing weeks or months
-- after signup reads as a broken system, and several of those accounts have
-- since gone inactive. The column only changes behaviour for signups from here
-- on. If a re-engagement message is wanted for the historical set, that is a
-- deliberate broadcast with its own copy, not a silent replay of onboarding.

alter table public.profiles
  add column if not exists welcome_email_sent_at timestamptz;

comment on column public.profiles.welcome_email_sent_at is
  'When the onboarding welcome email was sent. NULL = not yet sent. Claimed atomically by lib/email/welcome.ts; never set this by hand for an existing user unless you intend them to receive onboarding mail again.';

-- Treat all pre-existing profiles as already welcomed (see BACKFILL NOTE).
update public.profiles
   set welcome_email_sent_at = coalesce(created_at, now())
 where welcome_email_sent_at is null;
