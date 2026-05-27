// app/api/cron/daily/route.ts
// Single daily cron — Vercel Hobby plan allows ONE cron per day max
// Runs at 6am UTC every day via vercel.json
// Does two things: (1) ingest fresh jobs, (2) expire day passes
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send';
import { jobAlertEmail } from '@/lib/email/templates';

const CRON_SECRET = process.env.CRON_SECRET ?? '';
const CRON_MIN_LEN = 16;

const SOURCES = [
  { name: 'Remotive', url: 'https://remotive.com/api/remote-jobs?limit=50' },
  { name: 'Jobicy',   url: 'https://jobicy.com/api/v2/remote-jobs?count=50' },
];

export async function GET(req: NextRequest) {
  // Fail closed when CRON_SECRET is unset/short. The previous `if (SECRET && ...)`
  // pattern let any caller hit this endpoint when the env var was missing —
  // and this route mass-downgrades day-pass users to `free`. Mirror the
  // /api/cron/ingest pattern (503 when secret missing or too short).
  if (!CRON_SECRET || CRON_SECRET.length < CRON_MIN_LEN) {
    console.error('[cron/daily] CRON_SECRET not set or too short');
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const log: Record<string, unknown> = { startedAt: new Date().toISOString() };

  // ── TASK 1: Ingest fresh jobs ─────────────────────────────────────────
  let totalAdded = 0;
  const ingestResults: Record<string, number> = {};

  for (const source of SOURCES) {
    try {
      const res  = await fetch(source.url, { signal: AbortSignal.timeout(20000) });
      const data = await res.json();
      const raw  = (data.jobs ?? data.data ?? []) as any[];

      const jobs = raw.slice(0, 50).map((j: any) => ({
        title:       (j.title ?? j.job_title ?? 'Untitled').slice(0, 200),
        company:     (j.company_name ?? j.company ?? 'Unknown').slice(0, 100),
        logo:        (j.company_name ?? j.company ?? 'U')[0].toUpperCase(),
        category:    mapCat(j.category ?? ''),
        type:        'full-time',
        level:       mapLevel(j.title ?? ''),
        location:    (j.candidate_required_location ?? j.location ?? 'Worldwide').slice(0, 100),
        description: (j.description ?? '').slice(0, 5000),
        salary_min:  j.salary_min ?? null,
        salary_max:  j.salary_max ?? null,
        currency:    j.salary_currency ?? 'USD',
        apply_url:   j.url ?? j.apply_url ?? null,
        posted_at:   j.publication_date ?? new Date().toISOString(),
        source:      'api',
        source_url:  source.url,
        remote:      true,
        featured:    false,
        is_new:      true,
        is_active:   true,
      })).filter((j: any) => j.apply_url && j.title !== 'Untitled');

      if (!jobs.length) { ingestResults[source.name] = 0; continue; }

      // migration_v5 dropped the unique apply_url index; upsert(onConflict)
      // would error. Plain insert matches ingest-pipeline.ts behaviour.
      const { data: inserted } = await supabase
        .from('jobs')
        .insert(jobs)
        .select('id');

      ingestResults[source.name] = inserted?.length ?? 0;
      totalAdded += ingestResults[source.name];
    } catch (err: any) {
      console.error(`Ingest ${source.name}:`, err.message);
      ingestResults[source.name] = -1;
    }
  }

  log.ingest = { totalAdded, sources: ingestResults };

  // Update job_sources sync timestamps
  await supabase.from('job_sources').upsert(
    SOURCES.map(s => ({
      name: s.name, url: s.url, method: 'json-api',
      status: (ingestResults[s.name] ?? 0) >= 0 ? 'active' : 'error',
      last_sync_at: new Date().toISOString(),
      jobs_added: Math.max(0, ingestResults[s.name] ?? 0),
    })),
    { onConflict: 'url' }
  );

  // ── TASK 2: Expire subscriptions (all tiers) ──────────────────────────
  // Mirrors /api/cron/expire-daily so either cron alone can reconcile
  // state — see that route for the rationale on the 24h pro grace window.
  const now       = new Date().toISOString();
  const PRO_GRACE_MS = 24 * 60 * 60 * 1000;
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
    .in('status', ['active', 'cancelled'])
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

  // ── TASK 3: Mark old jobs as not new (> 7 days) ───────────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from('jobs')
    .update({ is_new: false })
    .eq('is_new', true)
    .lt('posted_at', sevenDaysAgo);


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
    console.error('Alert emails error:', err.message);
  }

  log.completedAt = new Date().toISOString();

  return NextResponse.json({ success: true, ...log });
}

function mapCat(raw: string): string {
  const r = raw.toLowerCase();
  // Order matters — more specific categories first to avoid mis-classification
  if (/product manager|product lead|product owner/.test(r)) return 'product';
  if (/data science|data engineer|machine learning|ml engineer|ai engineer|nlp|analytics/.test(r)) return 'data';
  if (/marketing|seo|content|growth|brand|social media|copywriter/.test(r)) return 'marketing';
  if (/finance|accounting|fp&a|payroll|controller|treasury/.test(r)) return 'finance';
  if (/sales|account exec|bdr|sdr|business dev/.test(r)) return 'sales';
  if (/recruiter|talent acquisition|hr manager|people ops|human resources/.test(r)) return 'hr';
  if (/legal|counsel|compliance|attorney/.test(r)) return 'legal';
  if (/design|ux|ui|figma|graphic/.test(r)) return 'design';
  if (/operations|ops|customer success|supply chain/.test(r)) return 'operations';
  if (/engineer|developer|software|devops|backend|frontend|fullstack/.test(r)) return 'engineering';
  return 'other';
}

function mapLevel(title: string): string {
  const t = title.toLowerCase();
  if (/junior|entry|associate|grad/.test(t)) return 'entry';
  if (/senior|sr\./.test(t))                 return 'senior';
  if (/lead|principal|staff/.test(t))        return 'lead';
  if (/vp|director|head|chief/.test(t))      return 'executive';
  return 'mid';
}
