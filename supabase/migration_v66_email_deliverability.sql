-- migration_v66_email_deliverability.sql
--
-- Record hard bounces and spam complaints reported by Resend's webhooks.
--
-- Until now nothing flowed back from the email provider into the app.
-- Resend auto-suppresses an address after a hard bounce, so those sends
-- silently stopped at their edge while our side kept listing the user as
-- a perfectly normal, mailable account — no way to tell "delivered" from
-- "never going to arrive again" from inside the product.
--
-- Spam complaints matter more. A complaint is the strongest possible
-- opt-out signal, and continuing to include that address in a broadcast
-- is what turns a single "report spam" click into a domain reputation
-- problem that takes the transactional confirm/reset mail down with it.
-- /api/webhooks/resend force-clears the opt-in prefs on complaint; these
-- columns are the durable record of why.
--
-- Both are nullable timestamps: NULL = no such event seen. They are only
-- ever written by the service-role webhook handler, never by the user.

alter table public.profiles
  add column if not exists email_bounced_at    timestamptz,
  add column if not exists email_complained_at timestamptz;

comment on column public.profiles.email_bounced_at is
  'Set by /api/webhooks/resend on a PERMANENT (hard) bounce. Transient bounces are ignored. Non-null means the address is undeliverable and is excluded from bulk sends.';

comment on column public.profiles.email_complained_at is
  'Set by /api/webhooks/resend when the recipient marks our mail as spam. Non-null means never include this address in bulk sends again.';

-- The daily cron and the admin broadcast both filter on "is this address
-- still mailable?" across the whole profile table, so back both lookups.
-- Partial indexes: the overwhelming majority of rows are NULL on both
-- columns and we only ever query for the non-null (problem) side.
create index if not exists profiles_email_bounced_at_idx
  on public.profiles (email_bounced_at) where email_bounced_at is not null;

create index if not exists profiles_email_complained_at_idx
  on public.profiles (email_complained_at) where email_complained_at is not null;

-- The v9 column lockdown revoked UPDATE on everything except name /
-- updated_at from `authenticated`, and these columns must stay that way:
-- a user clearing their own complaint flag would put us straight back
-- into mailing someone who reported us. Service-role only, which is what
-- the webhook handler uses. No grant is added here on purpose.
