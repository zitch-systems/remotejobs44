-- ============================================================
-- RemoteJobs44 — Migration v3 (safe to re-run)
-- Run as: postgres role in Supabase SQL Editor
-- All statements use DROP IF EXISTS before CREATE
-- ============================================================

-- ── profiles RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select"      ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert"      ON public.profiles;
DROP POLICY IF EXISTS "profiles_update"      ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_all" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (true);  -- trigger runs as SECURITY DEFINER, needs open insert

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- ── jobs RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobs_select"        ON public.jobs;
DROP POLICY IF EXISTS "jobs_public_read"   ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert"        ON public.jobs;
DROP POLICY IF EXISTS "jobs_update"        ON public.jobs;
DROP POLICY IF EXISTS "jobs_service_write" ON public.jobs;

CREATE POLICY "jobs_public_read" ON public.jobs
  FOR SELECT USING (is_active = true);

-- ── subscriptions RLS ─────────────────────────────────────────────────────
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subs_select"      ON public.subscriptions;
DROP POLICY IF EXISTS "subs_service_all" ON public.subscriptions;

CREATE POLICY "subs_select" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- ── Recreate profile trigger ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, plan, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'free',
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Ensure profile rows exist for any auth users that don't have one ──────
INSERT INTO public.profiles (id, email, name, plan, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
  'free',
  'user'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
);

-- ── job_alerts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_alerts (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  category   text,
  keywords   text,
  frequency  text        DEFAULT 'daily',
  active     boolean     DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.job_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alerts_all" ON public.job_alerts;
CREATE POLICY "alerts_all" ON public.job_alerts
  FOR ALL USING (auth.uid() = user_id);

-- ── Verify ────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg