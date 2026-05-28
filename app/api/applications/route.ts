// app/api/applications/route.ts — Persist job applications to Supabase
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';

// ── GET /api/applications — List current user's applications ─────────────
export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: applications, error } = await supabase
      .from('applications')
      .select('*')
      .eq('user_id', user.id)
      .order('applied_at', { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({ applications: (applications ?? []).map(transformApplication) });
  } catch (err: any) {
    console.error('[GET /api/applications]', err);
    return NextResponse.json({ error: 'Failed to load applications' }, { status: 500 });
  }
}

// ── POST /api/applications — Submit an application ───────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user has an active plan (pro, daily, or admin)
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, role, plan_expires_at')
      .eq('id', user.id)
      .maybeSingle();

    const plan = profile?.plan ?? 'free';
    const role = profile?.role ?? 'user';
    const allowedPlans = ['daily', 'pro', 'admin'];

    if (!allowedPlans.includes(plan) && role !== 'admin') {
      return NextResponse.json({ error: 'Active subscription required to apply for jobs' }, { status: 403 });
    }

    // Pro Monthly / Pro Annual revenue leak: `/api/cron/expire-daily` and
    // `/api/cron/daily` only downgrade subscriptions where billing='daily'.
    // If a Pro user's Paystack subscription stops renewing (card decline,
    // cancellation), `profile.plan` stays 'pro' indefinitely even though
    // `plan_expires_at` is in the past. Block applies in that window —
    // the client UI already shows 'free' via the effective-plan logic in
    // Header.buildUser / /api/profile, so this just makes the server agree.
    // Admins are exempt (their plan_expires_at may be null).
    if (
      plan === 'pro' &&
      role !== 'admin' &&
      profile?.plan_expires_at &&
      new Date(profile.plan_expires_at) < new Date()
    ) {
      return NextResponse.json({
        error: 'Your subscription has expired. Please renew to continue applying.',
      }, { status: 403 });
    }

    // For daily plan users: enforce the 10-application limit per day-pass period.
    //
    // HARD INVARIANT: this route NEVER writes to profiles.plan. Not even on
    // expiry. The /api/cron/daily expire-pass is the sole authority for
    // downgrades. A previous version of this code downgraded a user inline if
    // it couldn't find a matching subscriptions row, which wiped paying
    // accounts during webhook races. Don't reintroduce that.
    if (plan === 'daily') {
      const adminSupabase = createAdminSupabaseClient();
      const { data: sub } = await adminSupabase
        .from('subscriptions')
        .select('current_period_start, current_period_end, status')
        .eq('user_id', user.id)
        .eq('billing', 'daily')
        .eq('status', 'active')
        .maybeSingle();

      console.log(`[applications] day pass apply by ${user.id}: sub=${sub ? `status=${sub.status} end=${sub.current_period_end}` : 'NONE'}`);

      // Genuinely past current_period_end → reject this apply but DO NOT
      // touch profiles.plan. The cron handles the plan flip; we just gate.
      if (sub && new Date(sub.current_period_end) < new Date()) {
        return NextResponse.json({ error: 'Your day pass has expired. Please renew to continue applying.' }, { status: 403 });
      }

      // Row missing → webhook race after fresh purchase. Previously we
      // fell back to a "10 applies per hour" soft cap, which leaked: a
      // user could buy a ₦500 day pass, fire 10 applies, wait an hour,
      // fire 10 more, repeat until the webhook landed (or forever if it
      // failed). Now we refuse with 503 + retry hint until the
      // subscriptions row exists. The window is short (verify route runs
      // synchronously inside the Paystack redirect; webhook lands within
      // seconds) and a transient retry is the honest UX.
      if (!sub) {
        return NextResponse.json({
          error: 'Your day pass is still syncing. Please try again in a moment.',
        }, { status: 503, headers: { 'Retry-After': '5' } });
      }

      // Sub row present + still in period: enforce hard 10-apply cap
      // counted from current_period_start. Server is source of truth —
      // the dailyAppsUsed counter that used to live in Zustand was a
      // soft UI hint, never a real gate (localStorage.clear() bypassed
      // it). This count comes from the DB and can't be tampered with.
      const { count: appCount } = await supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('applied_at', sub.current_period_start);

      if ((appCount ?? 0) >= 10) {
        return NextResponse.json({
          error: 'You have reached the 10-application limit for your day pass. Upgrade to Pro for unlimited access.'
        }, { status: 403 });
      }
    }

    const body = await req.json();
    const { jobId } = body;
    if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 });

    // Fetch job details using admin client (bypasses RLS)
    const adminSupabase = createAdminSupabaseClient();
    const { data: job, error: jobError } = await adminSupabase
      .from('jobs')
      .select('id, title, company, logo')
      .eq('id', jobId)
      .maybeSingle();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Check for duplicate application (return 409 — already applied is not a 500)
    const { data: existing } = await supabase
      .from('applications')
      .select('id')
      .eq('user_id', user.id)
      .eq('job_id', jobId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'You have already applied to this job' }, { status: 409 });
    }

    const steps = [
      { label: 'Applied',   done: true,  date: new Date().toISOString() },
      { label: 'Screening', done: false },
      { label: 'Interview', done: false },
      { label: 'Decision',  done: false },
    ];

    const { data: application, error: insertError } = await supabase
      .from('applications')
      .insert({
        user_id:      user.id,
        job_id:       job.id,
        job_title:    job.title,
        company:      job.company,
        company_logo: job.logo ?? null,
        status:       'applied',
        auto_applied: body.autoApplied ?? false,
        steps,
      })
      .select()
      .single();

    if (insertError) {
      // Surface a clear error — don't expose raw DB messages
      console.error('[POST /api/applications] insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to save your application. Please try again.' },
        { status: 500 }
      );
    }

    // Increment job applications counter — fire-and-forget, never let it fail the request
    try {
      await adminSupabase.rpc('increment_applications', { job_id: jobId });
    } catch {}

    return NextResponse.json({ application: transformApplication(application) }, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/applications]', err);
    return NextResponse.json({ error: 'Failed to submit application. Please try again.' }, { status: 500 });
  }
}

function transformApplication(row: Record<string, unknown>) {
  return {
    id:           row.id,
    jobId:        row.job_id,
    jobTitle:     row.job_title,
    company:      row.company,
    companyLogo:  row.company_logo,
    status:       row.status ?? 'applied',
    appliedAt:    row.applied_at,
    updatedAt:    row.updated_at,
    autoApplied:  row.auto_applied ?? false,
    steps:        row.steps ?? [],
    notes:        row.notes ?? '',
  };
}
