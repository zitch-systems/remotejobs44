-- ============================================================
-- RemoteJobs44 — Supabase setup SQL
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. profiles table (if not already created)
CREATE TABLE IF NOT EXISTS public.profiles (
  id                 UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name               TEXT,
  plan               TEXT        NOT NULL DEFAULT 'free',
  role               TEXT        NOT NULL DEFAULT 'user',
  avatar             TEXT,
  cv_url             TEXT,
  profile_completion INTEGER     DEFAULT 20,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Auto-create profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, plan, role, profile_completion)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'free',
    'user',
    20
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop old trigger if it exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Promote zitchinfo@gmail.com to admin (safe to re-run)
UPDATE public.profiles
SET role = 'admin', plan = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'zitchinfo@gmail.com' LIMIT 1);

-- 4. Row-level security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Service role can do anything" ON public.profiles;
CREATE POLICY "Service role can do anything" ON public.profiles
  USING (true) WITH CHECK (true);

-- 5. jobs table (if not already created)
CREATE TABLE IF NOT EXISTS public.jobs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL,
  company      TEXT        NOT NULL,
  company_id   UUID,
  logo         TEXT,
  category     TEXT        NOT NULL DEFAULT 'other',
  type         TEXT        NOT NULL DEFAULT 'full-time',
  level        TEXT,
  salary_min   INTEGER,
  salary_max   INTEGER,
  currency     TEXT        DEFAULT 'USD',
  location     TEXT        NOT NULL DEFAULT 'Worldwide',
  timezone     TEXT,
  description  TEXT        NOT NULL DEFAULT '',
  requirements TEXT[],
  skills       TEXT[],
  benefits     TEXT[],
  apply_url    TEXT,
  apply_email  TEXT,
  posted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ,
  featured     BOOLEAN     DEFAULT FALSE,
  is_new       BOOLEAN     DEFAULT TRUE,
  is_active    BOOLEAN     DEFAULT TRUE,
  source       TEXT        DEFAULT 'manual',
  source_url   TEXT,
  remote       BOOLEAN     DEFAULT TRUE,
  views        INTEGER     DEFAULT 0,
  applications INTEGER     DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (title, company, apply_url)
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Jobs are publicly readable" ON public.jobs;
CREATE POLICY "Jobs are publicly readable" ON public.jobs
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Service role manages jobs" ON public.jobs;
CREATE POLICY "Service role manages jobs" ON public.jobs
  USING (true) WITH CHECK (true);

-- 6. applications table
CREATE TABLE IF NOT EXISTS public.applications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id       UUID        NOT NULL,
  job_title    TEXT        NOT NULL,
  company      TEXT        NOT NULL,
  company_logo TEXT,
  status       TEXT        NOT NULL DEFAULT 'applied',
  auto_applied BOOLEAN     DEFAULT FALSE,
  steps        JSONB       DEFAULT '[]',
  notes        TEXT,
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, job_id)
);

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own applications" ON public.applications;
CREATE POLICY "Users can view own applications" ON public.applications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own applications" ON public.applications;
CREATE POLICY "Users can insert own applications" ON public.applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages applications" ON public.applications;
CREATE POLICY "Service role manages applications" ON public.applications
  USING (true) WITH CHECK (true);

-- 7. Helper RPC to increment job applications counter
CREATE OR REPLACE FUNCTION public.increment_applications(job_id UUID)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER AS $$
  UPDATE public.jobs SET applications = applications + 1 WHERE id = job_id;
$$;

-- 8. site_settings table for admin settings
CREATE TABLE IF NOT EXISTS public.site_settings (
  id            INTEGER     PRIMARY KEY DEFAULT 1,
  site_name     TEXT        DEFAULT 'RemoteJobs44',
  site_url      TEXT        DEFAULT 'https://remotejobs44.com',
  contact_email TEXT        DEFAULT 'hello@remotejobs44.com',
  settings_json JSONB       DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT singl