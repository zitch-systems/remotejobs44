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
import { revalidatePath } from 'next/cache';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send';
import { jobAlertEmail } from '@/lib/email/templates';
import { runIngest } from '@/lib/ingest-pipeline';
import { requireCronSecret } from '@/lib/cron-auth';
import { logError, logWarn } from '@/lib/log';

const STALE_JOB_DAYS = 60;
const NEW_JOB_DAYS   = 7;
const PRO_GRACE_MS   = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  // Shared guard: fails closed (503) when CRON_SECRET is unset/short;
  // returns 401 on bearer mismatch using a constant-time compare so the
  // secret isn't leakable via timing-side-channel.
  const auth = requireCronSecret(req, 'cron.daily');
  if (!auth.ok) return auth.res;

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
    // Flush /jobs cache after a productive ingest so morning visitors
    // see the freshly imported postings instead of yesterday's snapshot
    // for the first 60 seconds. Skip when nothing was added — leaves
    // the warm cache alone for a no-op run.
    if (ingest.totalAdded > 0) {
      try { revalidatePath('/jobs'); }
      catch (err: any) { logWarn({ event: 'cron.daily.revalidate_failed', error: err?.message ?? String(err) }); }
    }
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
    // Don't clobber profile.plan='admin' to 'free' — same reason as
    // /api/cron/expire-daily. Role is unchanged so the user keeps
    // their actual privileges, but the plan tag matters for UI.
    await supabase.from('profiles').update({ plan: 'free' })
      .in('id', ids).neq('role', 'admin');
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
    await supabase.from('profiles').update({ plan: 'free' })
      .in('id', ids).neq('role', 'admin');
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
  // The previous version pulled ten newest jobs once and sent that same
  // list to every alert — alert.category and alert.keywords were ignored.
  // A user subscribed to "marketing" alerts received the same engineering
  // jobs as everyone else. Now we pull the full new-job set then filter
  // per alert on (category match) AND (every keyword appears in title or
  // company). Empty filters mean "all" on that axis.
  let alertsSent = 0;
  try {
    const { data: alerts } = await supabase
      .from('job_alerts')
      .select('user_id, category, keywords, profiles(name, email, plan)')
      .eq('active', true)
      .eq('frequency', 'daily');

    if (alerts && alerts.length > 0) {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      // Pull a wider candidate set than the previous 10 so a niche alert
      // doesn't get nothing just because the 10 most-recent jobs happen
      // to be in the wrong category. 500 is a soft cap — most days have
      // far fewer new postings; we slice down to 10 PER ALERT below.
      const { data: newJobs } = await supabase
        .from('jobs')
        .select('id, title, company, location, category')
        .eq('is_active', true)
        .gte('posted_at', yesterday)
        .limit(500);

      const allCandidates = newJobs ?? [];

      for (const alert of alerts) {
        const profile = (alert as any).profiles;
        if (!profile?.email || !['pro', 'admin'].includes(profile.plan)) continue;

        // Tokenise keywords on commas/whitespace, drop empties.
        // Match is case-insensitive substring against title or company.
        const tokens = String((alert as any).keywords ?? '')
          .toLowerCase()
          .split(/[,\s]+/)
          .filter(Boolean);
        const cat = String((alert as any).category ?? '').toLowerCase();

        const matched = allCandidates.filter((j: any) => {
          if (cat && cat !== 'all' && String(j.category ?? '').toLowerCase() !== cat) return false;
          if (tokens.length === 0) return true;
          const hay = `${j.title ?? ''} ${j.company ?? ''}`.toLowerCase();
          return tokens.every(t => hay.includes(t));
        }).slice(0, 10);

        // No matches in the last 24h is the normal state for narrow
        // alerts; suppress the email rather than send "0 new jobs."
        if (matched.length === 0) continue;

        const { subject, html } = jobAlertEmail(profile.name ?? 'there', matched);
        await sendEmail({ to: profile.email, subject, html });
        alertsSent += 1;
      }
    }
  } catch (err: any) {
    logError({ event: 'cron.daily.alert_emails_failed', error: err.message });
  }
  log.alerts = { sent: alertsSent };

  log.completedAt = new Date().toISOString();

  return NextResponse.json({ success: true, ...log });
}
