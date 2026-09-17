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
//   (3) Mark jobs older than 7 days as is_new = false, and deactivate
//       jobs not seen in any feed for 60 days (is_active = false), keeping
//       the visible job DB fresh. Staleness keys off last_seen_at
//       (migration_v27) so a posting a feed keeps listing never ages out.
//   (4) Send daily job-alert emails to Pro users with active alerts.
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send';
import { jobAlertEmail } from '@/lib/email/templates';
import { unsubscribeHeaders, unsubscribeUrl } from '@/lib/email/unsubscribe';
import { runIngest } from '@/lib/ingest-pipeline';
import { reconcilePaystackCharges } from '@/lib/paystack/reconcile';
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
  // Names of the tasks that failed this run. Every task below is independent
  // and best-effort — one failing must not stop the others — but the route
  // used to answer 200 {success:true} no matter what, so a run where every
  // task errored looked identical to a clean one in Vercel's cron log. That is
  // how a nightly job dies unnoticed.
  const failures: string[] = [];

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
    failures.push('ingest');
  }

  // ── TASK 2: Expire subscriptions (all tiers) ──────────────────────────
  // Mirrors /api/cron/expire-daily so either cron alone can reconcile
  // state — see that route for the rationale on the 24h pro grace window.
  const now       = new Date().toISOString();
  const proCutoff = new Date(Date.now() - PRO_GRACE_MS).toISOString();

  // Day Pass — hard expiry. Compare-and-set: expire the subscription rows with
  // the expiry predicate re-checked *inside* the UPDATE and derive the profile
  // ids from the rows actually updated. A Paystack renewal landing between a
  // stale SELECT and the write would otherwise still downgrade a just-paid
  // user; this mirrors the fix already applied in /api/cron/expire-daily.
  const { data: expiredDaily, error: dailyExpiryErr } = await supabase
    .from('subscriptions')
    .update({ status: 'expired' })
    .eq('billing', 'daily')
    .eq('status', 'active')
    .lt('current_period_end', now)
    .select('user_id');
  // A failed expiry leaves lapsed users on a paid plan indefinitely, so it has
  // to be loud. Without the error check the empty result read as "nobody
  // expired today" — indistinguishable from a healthy run.
  if (dailyExpiryErr) {
    logError({ event: 'cron.daily.expire_day_pass_failed', error: dailyExpiryErr.message });
    failures.push('expiry.day_pass');
  }

  let expiredDayPasses = 0;
  if (expiredDaily && expiredDaily.length > 0) {
    const ids = expiredDaily.map((s: { user_id: string }) => s.user_id);
    // Don't clobber profile.plan='admin' to 'free' — same reason as
    // /api/cron/expire-daily. Role is unchanged so the user keeps
    // their actual privileges, but the plan tag matters for UI.
    await supabase.from('profiles').update({ plan: 'free' })
      .in('id', ids).neq('role', 'admin');
    expiredDayPasses = ids.length;
  }

  // Pro Monthly / Annual — 24h grace. Same compare-and-set as the daily branch.
  const { data: expiredPro, error: proExpiryErr } = await supabase
    .from('subscriptions')
    .update({ status: 'expired' })
    .in('billing', ['monthly', 'annually'])
    // payment_failed is included so users whose card declines get
    // downgraded by the next cron pass — they were leaking ~12 free Pro
    // days/year while only 'active'/'cancelled' were checked.
    .in('status', ['active', 'cancelled', 'payment_failed'])
    .lt('current_period_end', proCutoff)
    .select('user_id');

  if (proExpiryErr) {
    logError({ event: 'cron.daily.expire_pro_failed', error: proExpiryErr.message });
    failures.push('expiry.pro');
  }

  let expiredPro_n = 0;
  if (expiredPro && expiredPro.length > 0) {
    const ids = expiredPro.map((s: { user_id: string }) => s.user_id);
    await supabase.from('profiles').update({ plan: 'free' })
      .in('id', ids).neq('role', 'admin');
    expiredPro_n = ids.length;
  }

  log.expiry = {
    expiredDayPasses,
    expiredPro: expiredPro_n,
    ...(dailyExpiryErr ? { dayPassError: dailyExpiryErr.message } : {}),
    ...(proExpiryErr   ? { proError:     proExpiryErr.message   } : {}),
  };

  // ── TASK 3: Job freshness pass ────────────────────────────────────
  //   * Mark jobs older than 7 days as is_new = false (UI badge).
  //   * Deactivate (is_active = false) jobs not seen in any feed for 60
  //     days. Public listings already filter `expires_at < now()`, but
  //     ATS upstreams rarely set expires_at, so without this sweep stale
  //     postings live forever in the DB.
  //
  // Staleness keys off last_seen_at (migration_v27), which the ingest
  // bumps every time a posting appears in a feed. A job an upstream keeps
  // listing therefore stays visible indefinitely; one that drops out of
  // every feed ages out 60 days later. (is_new still keys off posted_at —
  // newness is about when the job was posted, not when we last saw it.)
  const sevenDaysAgo = new Date(Date.now() - NEW_JOB_DAYS  * 86_400_000).toISOString();
  const staleCutoff  = new Date(Date.now() - STALE_JOB_DAYS * 86_400_000).toISOString();

  // Update in bounded batches. A single UPDATE across the six-figure jobs
  // table exceeded Supabase's statement timeout and achieved nothing. Each
  // batch is independently committed and small enough to stay below the DB
  // timeout; any remaining backlog drains on the next daily run.
  const FRESHNESS_BATCH_SIZE = 500;
  const FRESHNESS_MAX_BATCHES = 20;

  let unflaggedNew = 0;
  let unflagErr: { message: string } | null = null;
  let unflagCapped = false;
  for (let batch = 0; batch < FRESHNESS_MAX_BATCHES; batch++) {
    const { data: rows, error: selectErr } = await supabase
      .from('jobs')
      .select('id')
      .eq('is_new', true)
      .lt('posted_at', sevenDaysAgo)
      .order('posted_at', { ascending: true })
      .limit(FRESHNESS_BATCH_SIZE);
    if (selectErr) { unflagErr = selectErr; break; }
    const ids = (rows ?? []).map((row: { id: string }) => row.id);
    if (ids.length === 0) break;

    const { error: updateErr } = await supabase
      .from('jobs')
      .update({ is_new: false })
      .in('id', ids);
    if (updateErr) { unflagErr = updateErr; break; }
    unflaggedNew += ids.length;
    if (ids.length < FRESHNESS_BATCH_SIZE) break;
    if (batch === FRESHNESS_MAX_BATCHES - 1) unflagCapped = true;
  }
  if (unflagErr) {
    logError({ event: 'cron.daily.unflag_new_failed', error: unflagErr.message });
    failures.push('freshness.mark_not_new');
  } else if (unflagCapped) {
    logWarn({ event: 'cron.daily.unflag_new_backlog', updated: unflaggedNew });
  }

  let deactivated = 0;
  let staleErr: { message: string } | null = null;
  let staleCapped = false;
  for (let batch = 0; batch < FRESHNESS_MAX_BATCHES; batch++) {
    const { data: rows, error: selectErr } = await supabase
      .from('jobs')
      .select('id')
      .eq('is_active', true)
      .lt('last_seen_at', staleCutoff)
      .order('last_seen_at', { ascending: true })
      .limit(FRESHNESS_BATCH_SIZE);
    if (selectErr) { staleErr = selectErr; break; }
    const ids = (rows ?? []).map((row: { id: string }) => row.id);
    if (ids.length === 0) break;

    const { error: updateErr } = await supabase
      .from('jobs')
      .update({ is_active: false })
      .in('id', ids);
    if (updateErr) { staleErr = updateErr; break; }
    deactivated += ids.length;
    if (ids.length < FRESHNESS_BATCH_SIZE) break;
    if (batch === FRESHNESS_MAX_BATCHES - 1) staleCapped = true;
  }
  if (staleErr) {
    logError({ event: 'cron.daily.stale_sweep_failed', error: staleErr.message });
    failures.push('freshness.stale_sweep');
  } else if (staleCapped) {
    logWarn({ event: 'cron.daily.stale_sweep_backlog', updated: deactivated });
  }

  log.freshness = {
    markedNotNew:   unflaggedNew,
    deactivated,
    staleAfterDays: STALE_JOB_DAYS,
    backlogRemaining: unflagCapped || staleCapped,
    ...(unflagErr ? { markedNotNewError: unflagErr.message } : {}),
    ...(staleErr  ? { deactivatedError:  staleErr.message  } : {}),
  };

  // ── TASK 3.5: Purge old paystack_webhook_events ────────────────────────
  // The webhook dedup table grows by ~1 row per Paystack event forever
  // (the route only inserts, never deletes). Keep ≥90 days for charge-
  // dispute / audit lookups, drop the rest. 90 days easily covers
  // Paystack's own retry window + a multi-week QA cycle for an
  // ops-issue investigation.
  const WEBHOOK_RETAIN_DAYS = 90;
  const webhookCutoff = new Date(Date.now() - WEBHOOK_RETAIN_DAYS * 86_400_000).toISOString();
  const { count: purgedWebhooks, error: purgeErr } = await supabase
    .from('paystack_webhook_events')
    .delete({ count: 'exact' })
    .lt('received_at', webhookCutoff);
  if (purgeErr) {
    logError({ event: 'cron.daily.webhook_purge_failed', error: purgeErr.message });
    failures.push('webhook_purge');
  }
  log.webhookPurge = {
    purged:          purgedWebhooks ?? 0,
    retainDays:      WEBHOOK_RETAIN_DAYS,
    ...(purgeErr ? { error: purgeErr.message } : {}),
  };

  // ── TASK 3.6: Reconcile missed Paystack charges ─────────────────────────
  // Safety net for "paid but not credited": if a buyer's post-payment redirect
  // didn't complete AND the charge.success webhook wasn't delivered, the
  // payment never reflects. Sweep recent successful charges and credit any user
  // who paid but has no active access. Idempotent on paystack_reference + an
  // active-access guard, so it never double-credits. See lib/paystack/reconcile.
  try {
    log.reconcile = await reconcilePaystackCharges(supabase, { sinceDays: 7, maxPages: 2 });
  } catch (err: any) {
    logError({ event: 'cron.daily.reconcile_failed', error: err?.message ?? String(err) });
    log.reconcile = { error: err?.message ?? String(err) };
    failures.push('reconcile');
  }

  // ── TASK 3.7: De-duplicate jobs ─────────────────────────────────────────
  // Sources hand out a fresh apply_url for the same role on each pull, so the
  // same title+company+location accumulates active rows over time (the unique
  // index on apply_url can't catch those). dedupe_jobs() keeps the best row per
  // (title, company, location) and deactivates the rest — reversible, and it
  // leaves the same role across different locations intact. See migration_v30,
  // and migration_v69 for the index + per-run group cap that stopped this
  // hitting the Postgres statement timeout every night. The cap means a large
  // backlog drains over several nights rather than in one run, so a non-zero
  // `deactivated` on consecutive days is expected while it catches up.
  try {
    const { data: deactivated, error: dedupeErr } = await supabase.rpc('dedupe_jobs');
    if (dedupeErr) throw dedupeErr;
    log.jobDedupe = { deactivated: deactivated ?? 0 };
  } catch (err: any) {
    logError({ event: 'cron.daily.dedupe_failed', error: err?.message ?? String(err) });
    log.jobDedupe = { error: err?.message ?? String(err) };
    failures.push('dedupe');
  }


  // ── TASK 4: Send job alert emails to Pro users ────────────────────────
  // The previous version pulled ten newest jobs once and sent that same
  // list to every alert — alert.category and alert.keywords were ignored.
  // A user subscribed to "marketing" alerts received the same engineering
  // jobs as everyone else. Now we pull the full new-job set then filter
  // per alert on (category match) AND (every keyword appears in title or
  // company). Empty filters mean "all" on that axis.
  let alertsSent = 0;
  // Counted separately from "no matching jobs" so the cron log distinguishes
  // "nothing to send" from "suppressed by the recipient's preferences".
  let alertsSkipped = 0;
  try {
    // email_prefs comes along because the send loop below has to honour it —
    // the profile toggle at /profile → "Job alerts" wrote to this column but
    // nothing ever read it, so switching it off changed nothing and the user
    // kept receiving alerts. That is both a broken setting and the kind of
    // thing that earns a spam complaint instead of an unsubscribe.
    const { data: alerts } = await supabase
      .from('job_alerts')
      .select('user_id, category, keywords, profiles(name, email, plan, email_prefs, suspended, email_bounced_at, email_complained_at)')
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
        // Gate on created_at (when WE ingested the row), not posted_at.
        // Feeds report the upstream publish date, which is routinely days/
        // weeks old, so a job ingested today but published last week never
        // entered the "new since yesterday" set and the alert emails went
        // out mostly empty. created_at is our own insert timestamp.
        .gte('created_at', yesterday)
        .order('created_at', { ascending: false })
        .limit(500);

      const allCandidates = newJobs ?? [];

      for (const alert of alerts) {
        const profile = (alert as any).profiles;
        if (!profile?.email || !['pro', 'admin'].includes(profile.plan)) continue;
        // Respect the user's opt-out. Absent key = opted in (the column
        // default, and the fallback used by /api/profile/email-prefs).
        if (profile.email_prefs?.job_alerts === false) { alertsSkipped += 1; continue; }
        if (profile.suspended) { alertsSkipped += 1; continue; }
        // Undeliverable or previously reported us as spam (recorded by
        // /api/webhooks/resend). Resend suppresses these on its own side
        // anyway, so sending is a guaranteed no-op that still counts
        // against the daily quota — and re-mailing a complainant is how a
        // single "report spam" click becomes a domain reputation problem.
        if (profile.email_bounced_at || profile.email_complained_at) { alertsSkipped += 1; continue; }

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

        // One-click unsubscribe in both the footer and the List-Unsubscribe
        // header — Gmail/Yahoo bulk-sender rules expect the header, and a
        // recipient who can't find an opt-out reaches for "report spam",
        // which costs us delivery on the transactional confirm/reset mail
        // that signup depends on.
        const unsubLink = unsubscribeUrl((alert as any).user_id, 'job_alerts');
        const { subject, html } = jobAlertEmail(profile.name ?? 'there', matched, unsubLink);
        await sendEmail({
          to: profile.email,
          subject,
          html,
          headers: unsubscribeHeaders((alert as any).user_id, 'job_alerts'),
        });
        alertsSent += 1;
      }
    }
  } catch (err: any) {
    logError({ event: 'cron.daily.alert_emails_failed', error: err.message });
    log.alertsError = err.message;
    failures.push('alerts');
  }
  log.alerts = { sent: alertsSent, skipped_by_prefs: alertsSkipped };

  log.completedAt = new Date().toISOString();

  // Answer 500 when any task failed so the failure shows up in Vercel's cron
  // log as a failed invocation. Everything that DID succeed is already
  // committed — the tasks are independent and there is no transaction to roll
  // back — so the status code is a signal, not a retraction.
  if (failures.length > 0) {
    return NextResponse.json({ success: false, failures, ...log }, { status: 500 });
  }
  return NextResponse.json({ success: true, ...log });
}
