// app/api/cron/daily/route.ts
//
// Single daily cron — runs at 06:00 UTC via vercel.json.
//
// Does four jobs in one pass:
//   (1) Ingest fresh jobs from every active source (Remotive, Jobicy,
//       RemoteOK, Arbeitnow, Findwork, SerpApi — the full list in
//       lib/ingest-pipeline.ts). Sources whose row in job_sources has
//       status='paused' are skipped, so admins can disable a misbehaving
//       feed without redeploying.
//   (2) Expire subscriptions (Day Pass + Pro Monthly/Annual with the
//       documented 24h grace, plus payment_failed accounts).
//   (3) Mark jobs older than 7 days as is_new = false, and jobs older
//       than 60 days as is_active = false. Refreshes the visible job DB
//       without the apply_url unique constraint the user deliberately
//       removed (see feedback_no_apply_url_dedup.md in user memory).
//   (4) Send daily job-alert emails to Pro users with active alerts.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send';
import { jobAlertEmail } from '@/lib/email/templates';
import { runIngest } from '@/lib/ingest-pipeline';
import { logError } from '@/lib/log';

const CRON_SECRET = process.env.CRON_SECRET ?? '';
const CRON_MIN_LEN = 16;

const STALE_JOB_DAYS = 60;
const NEW_JOB_DAYS   = 7;
const PRO_GRACE_MS   = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  // Fail closed when CRON_SECRET is unset/short. The previous `if (SECRET && ...)`
  // pattern let any caller hit this endpoint when the env var was missing —
  // and this route mass-downgrades day-pass users to `free`. Mirror the
  // /api/cron/ingest pattern (503 when secret missing or too short).
  if (!CRON_SECRET || CRON_SECRET.length < CRON_MIN_LEN) {
    logError({ event: 'cron.daily.misconfigured', detail: 'CRON_SECRET missing or too short' });
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const log: Record<string, unknown> = { startedAt: new Date().toISOString() };

  // ── TASK 1: Ingest fresh jobs from every active source ─────────────
  // Delegate to the shared pipeline so the cron and the admin
  // "run now" button can't drift. The previous version hard-coded only
  // Remotive + Jobicy inline, missing RemoteOK / Arbeitnow / Findwork /
  // SerpApi that lib/ingest-pipeline.ts has been ingesting via the
  // separate /api/cron/ingest route.
  try {
    const ingest = await runIngest();
    log.ingest = {
      totalAdded: ingest.totalAdded,
      sources:    ingest.results,
      paused:     ingest.paused,
    };
  } catch (err: any) {
    logError({ event: 'cron.daily.ingest_failed', error: err.message });
    log.ingest = { error: err.message };
  }

  // ── TASK 2: Expire subscriptions (all tiers) ──────────────────────────
  // Mirrors /api/cron/expire-daily so either cron alone can reconcile
  // state — see that route for the rationale on the 24h pro grace window.
  const now       = new Date().toISOString();
  const proCutoff = new Date(Date.now() - PRO_GRACE_MS).toISOString();

  // Day Pass — hard expiry
  const { data: expiredDaily } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('billing', 'daily')
    .eq('status', 'active')
    .lt('current_period_end', now);

  let expiredDayPasses = 0;
  if (expiredDaily && expiredDaily.length > 0) {
    const ids = expiredDaily.map((s: { user_id: string }) => s.user_id);
    await supabase.from('profiles').update({ plan: 'free' }).in('id', ids);
    await supabase.from('subscriptions')
      .update({ status: 'expired' })
      .in('user_id', ids)
      .eq('billing', 'daily');
    expiredDayPasses = ids.length;
  }

  // Pro Monthly / Annual — 24h grace
  const { data: expiredPro } = await supabase
    .from('subscriptions')
    .select('user_id')
    .in('billing', ['monthly', 'annually'])
    // payment_failed is included so users whose card declines get
    // downgraded by the next cron pass — they were leaking ~12 free Pro
    // days/year while only 'active'/'cancelled' were checked.
    .in('status', ['active', 'cancelled', 'payment_failed'])
    .lt('current_period_end', proCutoff);

  let expiredPro_n = 0;
  if (expiredPro && expiredPro.length > 0) {
    const ids = expiredPro.map((s: { user_id: string }) => s.user_id);
    await supabase.from('profiles').update({ plan: 'free' }).in('id', ids);
    await supabase.from('subscriptions')
      .update({ status: 'expired' })
      .in('user_id', ids)
      .in('billing', ['monthly', 'annually']);
    expiredPro_n = ids.length;
  }

  log.expiry = { expiredDayPasses, expiredPro: expiredPro_n };

  // ── TASK 3: Job freshness pass ────────────────────────────────────
  //   * Mark jobs older than 7 days as is_new = false (UI badge).
  //   * Mark jobs older than 60 days as is_active = false (hide from
  //     public listings). Public listings already filter
  //     `expires_at < now()`, but ATS upstreams rarely set expires_at,
  //     so without this sweep stale postings live forever in the DB.
  //
  // Per the user's no-dedup decision, the cron re-inserts fresh copies
  // of currently-listed jobs every day. This sweep is what keeps the
  // visible surface current without re-introducing apply_url
  // uniqueness — old duplicates stay queryable for admin/audit but
  // disappear from public lists.
  const sevenDaysAgo = new Date(Date.now() - NEW_JOB_DAYS  * 86_400_000).toISOString();
  const staleCutoff  = new Date(Date.now() - STALE_JOB_DAYS * 86_400_000).toISOString();

  const { count: unflaggedNew } = await supabase
    .from('jobs')
    .update({ is_new: false }, { count: 'exact' })
    .eq('is_new', true)
    .lt('posted_at', sevenDaysAgo);

  const { count: deactivated } = await supabase
    .from('jobs')
    .update({ is_active: false }, { count: 'exact' })
    .eq('is_active', true)
    .lt('posted_at', staleCutoff);

  log.freshness = {
    markedNotNew:   unflaggedNew ?? 0,
    deactivated:    deactivated  ?? 0,
    staleAfterDays: STALE_JOB_DAYS,
  };


  // ── TASK 4: Send job alert emails to Pro users ────────────────────────
  try {
    const { data: alerts } = await supabase
      .from('job_alerts')
      .select('user_id, category, keywords, profiles(name, email, plan)')
      .eq('active', true)
      .eq('frequency', 'daily');

    if (alerts && alerts.length > 0) {
      // Get today's new jobs
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: newJobs } = await supabase
        .from('jobs')
        .select('id, title, company, location')
        .eq('is_active', true)
        .gte('posted_at', yesterday)
        .limit(10);

      if (newJobs && newJobs.length > 0) {
        for (const alert of alerts) {
          const profile = (alert as any).profiles;
          if (!profile?.email || !['pro','admin'].includes(profile.plan)) continue;
          const { subject, html } = jobAlertEmail(profile.name ?? 'there', newJobs);
          await sendEmail({ to: profile.email, subject, html });
        }
      }
    }
  } catch (err: any) {
    logError({ event: 'cron.daily.alert_emails_failed', error: err.message });
  }

  log.completedAt = new Date().toISOString();

  return NextResponse.json({ success: true, ...log });
}
