-- ============================================================
-- RemoteJobs44 — Migration v3
-- Run AFTER migration_v2.sql
-- Fixes: RLS policies, missing columns, performance
-- ============================================================

-- ── Fix profiles RLS — add missing insert policy for new signups ──────────
-- Without this, the trigger that creates profiles on signup fails silently
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;

-- Allow users to read their own profile
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Allow the system to insert a profile on signup (trigger runs as definer)
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id OR auth.uid() IS NULL);

-- Allow users to update their own profile
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Allow service role to do anything (needed for admin operations)
CREATE POLICY "profiles_service_all" ON public.profiles
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ── Fix jobs RLS — allow public read of active jobs ───────────────────────
DROP POLICY IF EXISTS "jobs_select" ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert" ON public.jobs;
DROP POLICY IF EXISTS "jobs_update" ON public.jobs;

CREATE POLICY "jobs_public_read" ON public.jobs
  FOR SELECT USING (is_active = true);

CREATE POLICY "jobs_service_write" ON public.jobs
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ── Fix subscriptions RLS ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "subs_select" ON public.subscriptions;

CREATE POLICY "subs_select" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "subs_service_all" ON public.subscriptions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ── Ensure profile trigger exists (recreate to be safe) ───────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, plan, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
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

-- ── Job alerts table (if not already created) ─────────────────────────────
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

DROP POLICY IF EXISTS "alerts_all" ON public.job_alerts;
CREATE POLICY "alerts_all" ON public.job_alerts
  FOR ALL USING (auth.uid() = user_id);

-- ── Verify everything ─────────────────────────────────────────────────────
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN ('profiles','jobs','subscriptions','job_alerts')
ORDER BY tablename, policyname;
