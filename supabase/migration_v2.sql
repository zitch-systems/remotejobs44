-- ============================================================
-- RemoteJobs44 — Migration v2
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New Query
--   Make sure you are using the "postgres" role (top right dropdown)
--   If you see "must be owner" error, switch role to postgres first
-- ============================================================

-- Switch to superuser role (paste this first if you get permission errors)
-- SET ROLE postgres;

-- ── 1. profiles.plan constraint ───────────────────────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'daily', 'pro', 'admin'));

-- ── 2. subscriptions.billing constraint ──────────────────────────────────
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_billing_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_billing_check
  CHECK (billing IN ('daily', 'monthly', 'annually'));

-- ── 3. Add Paystack columns (safe — skips if already exist) ───────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paystack_customer_code text,
  ADD COLUMN IF NOT EXISTS paystack_subscription_code text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS paystack_customer_code text,
  ADD COLUMN IF NOT EXISTS cv_url text;

-- ── 4. Rename old Stripe columns if they exist ───────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE public.subscriptions
      RENAME COLUMN stripe_customer_id TO paystack_customer_code;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'stripe_subscription_id'
  ) THEN
    ALTER TABLE public.subscriptions
      RENAME COLUMN stripe_subscription_id TO paystack_subscription_code;
  END IF;
END $$;

-- ── 5. Downgrade any 'team' plan users to 'pro' ───────────────────────────
UPDATE public.profiles SET plan = 'pro' WHERE plan = 'team';

-- ── 6. jobs table — add apply_url for dedup, posted_at for sorting ────────
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS apply_url  text,
  ADD COLUMN IF NOT EXISTS posted_at  timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_active  boolean     DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_new     boolean     DEFAULT true,
  ADD COLUMN IF NOT EXISTS featured   boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS remote     boolean     DEFAULT true,
  ADD COLUMN IF NOT EXISTS salary_min integer,
  ADD COLUMN IF NOT EXISTS salary_max integer,
  ADD COLUMN IF NOT EXISTS currency   text        DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS level      text,
  ADD COLUMN IF NOT EXISTS source     text        DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS logo       text,
  ADD COLUMN IF NOT EXISTS skills     text[],
  ADD COLUMN IF NOT EXISTS benefits   text[],
  ADD COLUMN IF NOT EXISTS requirements text[];

-- Unique index on apply_url for upsert dedup during job ingestion
CREATE UNIQUE INDEX IF NOT EXISTS jobs_apply_url_idx
  ON public.jobs(apply_url)
  WHERE apply_url IS NOT NULL;

-- ── 7. Performance indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS jobs_category_idx
  ON public.jobs(category);

CREATE INDEX IF NOT EXISTS jobs_posted_at_idx
  ON public.jobs(posted_at DESC);

CREATE INDEX IF NOT EXISTS jobs_is_active_idx
  ON public.jobs(is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS jobs_featured_idx
  ON public.jobs(featured)
  WHERE featured = true;

CREATE INDEX IF NOT EXISTS subs_expiry_idx
  ON public.subscriptions(billing, status, current_period_end);

-- ── 8. job_sources table (for admin sources page) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.job_sources (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name          text        NOT NULL,
  url           text        NOT NULL UNIQUE,
  method        text        NOT NULL DEFAULT 'rss',
  status        text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','error','pending','disabled')),
  last_sync_at  timestamptz,
  jobs_added    integer     DEFAULT 0,
  jobs_updated  integer     DEFAULT 0,
  sync_interval integer     DEFAULT 60,
  error_message text,
  created_at    timestamptz DEFAULT now()
);

-- ── 9. Verification queries ────────────────────────────────────────────────
-- Run these after to confirm everything worked:
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM   pg_constraint
WHERE  conrelid = 'public.profiles'::regclass
  AND  contype  = 'c';

SELECT column_name, data_type
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'profiles'
  AND  column_name  IN ('plan','cv_url','paystack_customer_code')
ORDER BY column_name;

-- ── Job Alerts table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_alerts (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  category   text,
  keywords   text,
  frequency  text        DEFAULT 'daily' CHECK (frequency IN ('daily','instant')),
  active     boolean     DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.job_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alerts_select" ON public.job_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "alerts_insert" ON public.job_