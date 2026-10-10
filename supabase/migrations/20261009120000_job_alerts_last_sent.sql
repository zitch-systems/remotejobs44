-- Duplicate-send guard for the daily job-alert emails (app/api/cron/daily).
-- The cron records when it last mailed each alert so a retried or manually
-- re-run invocation the same day does not mail everyone again, and so a run
-- cut short by its time budget resumes with the least-recently-sent users.
-- Nullable: NULL means "never sent". The cron tolerates this column being
-- absent (it logs a warning and runs without the guard), so deploy order
-- does not matter.
alter table public.job_alerts
  add column if not exists last_sent_at timestamptz;

notify pgrst, 'reload schema';
