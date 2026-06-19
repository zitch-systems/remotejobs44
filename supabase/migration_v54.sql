-- ============================================================
-- RemoteJobs44 — Migration v54
-- Run AFTER migration_v53.sql in: Supabase Dashboard → SQL Editor.
--
-- Schedule the push-notification sender. The send-job-alerts edge function was
-- deployed but never scheduled, so job-alert pushes never fired. Use pg_net so
-- pg_cron can POST to the function daily.
--
-- SETUP (one-time):
--   1) Replace <PUSH_CRON_SECRET> below with a random value.
--   2) Set the SAME value as a function secret:
--        Supabase → Edge Functions → Secrets → PUSH_CRON_SECRET = <that value>
--      (NOTE: a stray edge function literally named "PUSH_CRON_SECRET" was
--       created by mistake — delete it; the secret is an env var, not a fn.)
--   3) Until the secret is set the function runs unauthenticated; setting it
--      makes the cron's Authorization header the required gate.
--
-- Idempotent — safe to re-run.
-- ============================================================

create extension if not exists pg_net;

select cron.unschedule('send-job-alerts')
where exists (select 1 from cron.job where jobname = 'send-job-alerts');

select cron.schedule('send-job-alerts', '0 9 * * *', $cron$
  select net.http_post(
    url := 'https://gnyilmahiyddplsrrhoq.supabase.co/functions/v1/send-job-alerts',
    headers := jsonb_build_object('Authorization','Bearer <PUSH_CRON_SECRET>','Content-Type','application/json'),
    body := '{}'::jsonb
  );
$cron$);
