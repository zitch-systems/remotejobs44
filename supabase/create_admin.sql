-- ============================================================
-- Create Admin User
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Step 1: Create the auth user
-- (Supabase doesn't let you insert into auth.users directly via SQL)
-- Use this instead — run in SQL Editor with service role:

SELECT auth.uid(); -- just to confirm you're connected

-- OPTION A: Use Supabase Dashboard UI (RECOMMENDED)
-- 1. Go to: Authentication → Users → Add User
-- 2. Email: admin@remotejobs44.com
-- 3. Password: (choose a strong one)
-- 4. Click "Create User"
-- 5. Then run Step 2 below

-- OPTION B: Use this SQL (paste your user ID from the Users table after creating)
-- UPDATE public.profiles
--   SET plan = 'admin', role = 'admin'
--   WHERE email = 'admin@remotejobs44.com';

-- Step 2: After creating user in the dashboard, promote to admin:
UPDATE public.profiles
  SET plan = 'admin',
      role = 'admin',
      name = 'Admin'
  WHERE email = 'admin@remotejobs44.com';

-- Verify
SELECT id, email, name, plan, role FROM public.pr