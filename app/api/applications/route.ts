// app/api/applications/route.ts — Persist job applications to Supabase
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import { recomputeAndPersistProfileCompletion } from '@/lib/auth/profile-completion-persist';
import { evaluateFreeTrial, freeTrialBlockedMessage } from '@/lib/auth/free-trial';
import { resolvePlan } from '@/lib/auth/plan';
import { applicationCreateSchema } from '@/lib/api-schemas';
import { logError, logInfo, logWarn } from '@/lib/log';
import { waitUntil } from '@vercel/functions';

// ── GET /api/applications — List current user's applications ─────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // A tracked application is the capability that reveals the off-site
    // channel to free users. This lets them return to an application later
    // without making the full jobs catalogue public.
    const channelJobId = new URL(req.url).searchParams.get('channel');
    if (channelJobId) {
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuid.test(channelJobId)) {
        return NextResponse.json({ error: 'Invalid jobId' }, { status: 400 });
      }

      const { data: tracked } = await supabase
        .from('applications')
        .select('id')
        .eq('user_id', user.id)
        .eq('job_id', channelJobId)
        .maybeSingle();
      if (!tracked) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
      }

      const { data: job } = await createAdminSupabaseClient()
        .from('jobs')
        .select('apply_url, apply_email')
        .eq('id', channelJobId)
        .maybeSingle();
      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      return NextResponse.json({
        applyUrl: job.apply_url ?? null,
        applyEmail: job.apply_email ?? null,
      });
    }

    const { data: applications, error } = await supabase
      .from('applications')
      .select('*')
      .eq('user_id', user.id)
      .order('applied_at', { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({ applications: (applications ?? []).map(transformApplication) });
  } catch (err: any) {
    logError({ event: 'applications.get_failed', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Failed to load applications' }, { status: 500 });
  }
}

// ── POST /api/applications — Submit an application ───────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Email-confirmation gate. Supabase's dashboard setting can be
    // toggled OFF (by a future admin, by an env migration) which would
    // silently let unverified accounts apply. Enforce here too so the
    // requirement survives a config drift. user.email_confirmed_at is
    // set by Supabase Auth when the recovery / confirmation link is
    // clicked; null until then.
    if (!user.email_confirmed_at) {
      return NextResponse.json(
        { error: 'Please confirm your email address before applying. Check your inbox for the verification link.' },
        { status: 403 },
      );
    }

    // Parse + validate the target job id up front, and short-circuit an
    // already-applied request with a clean 409 BEFORE any plan / free-trial
    // gating. Re-applying to a job you already applied to must never surface
    // as a "subscribe" paywall — that count gate is for NEW applications.
    // Validate the body at the boundary. The schema requires a uuid `jobId`
    // (applications.job_id is uuid — a bad shape would otherwise cascade into
    // a PostgREST 22P02 → 500) and coerces `autoApplied` to a boolean rather
    // than rejecting a non-boolean, matching the old `=== true` semantics.
    const body = await req.json().catch(() => null);
    const parsed = applicationCreateSchema.safeParse(body);
    if (!parsed.success) {
      // Preserve the original two-message contract: a missing/empty jobId is
      // "required", anything present-but-malformed is "Invalid".
      const jobIdMissing = body == null || body.jobId === undefined
        || body.jobId === null || body.jobId === '';
      return NextResponse.json(
        { error: jobIdMissing ? 'jobId is required' : 'Invalid jobId' },
        { status: 400 },
      );
    }
    const { jobId, autoApplied } = parsed.data;

    const { data: existing } = await supabase
      .from('applications')
      .select('id')
      .eq('user_id', user.id)
      .eq('job_id', jobId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'You have already applied to this job' }, { status: 409 });
    }

    // Check user has an active plan (pro, daily, or admin)
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, role, plan_expires_at, created_at')
      .eq('id', user.id)
      .maybeSingle();

    const rawPlan = profile?.plan ?? 'free';
    const role = profile?.role ?? 'user';
    const planExpiresAt = profile?.plan_expires_at ?? null;
    const allowedPlans = ['daily', 'pro', 'admin'];

    // Gate on the EFFECTIVE plan — the same resolution /api/profile and the
    // client use — so the server agrees with what the user sees. resolvePlan
    // downgrades a lapsed pro/daily (expiry in the past) to 'free' and keeps
    // admins unlimited. This replaces a hand-rolled lapsed-pro check that used
    // to live below and could drift out of agreement with the rest of the app.
    let plan = resolvePlan({ role, dbPlan: rawPlan, planExpiresAt });
    // Webhook race: right after a successful charge the verify route has
    // already stamped a FUTURE plan_expires_at, but the subscription webhook
    // that flips profiles.plan can lag a few seconds. A future expiry proves the
    // payment cleared, so honor it as paid access rather than bouncing a
    // just-paid user into the free-trial gate. (We can't tell daily vs pro from
    // the lagging column, so grant the unlimited tier for the brief race.)
    const hasFutureExpiry = !!planExpiresAt && new Date(planExpiresAt) > new Date();
    if (plan === 'free' && hasFutureExpiry) plan = 'pro';

    // A previously-paid plan whose expiry lapsed resolves to 'free'. Give those
    // users a renew-focused message instead of the new-user free-trial copy.
    if (plan === 'free' && role !== 'admin' && (rawPlan === 'pro' || rawPlan === 'daily')) {
      return NextResponse.json({
        error: 'Your subscription has expired. Please renew to continue applying.',
      }, { status: 403 });
    }

    // Free-trial gate for registered (free-plan) users. Every account gets
    // a small number of free applications within a fixed window after
    // signup; past the allowance OR the window, they're told to subscribe.
    // Enforced server-side so it can't be bypassed by editing client state.
    if (!allowedPlans.includes(plan) && role !== 'admin') {
      const { count: usedCount } = await supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      const trial = evaluateFreeTrial({
        // profiles.created_at is the canonical registration time; fall back
        // to the auth user's created_at if the profile row predates the
        // column default for any reason.
        registeredAt: profile?.created_at ?? user.created_at,
        used: usedCount ?? 0,
      });

      logInfo({
        event:    'applications.free_trial_apply',
        user_id:  user.id,
        used:     usedCount ?? 0,
        remaining: trial.remaining,
        window_expired: trial.windowExpired,
      });

      if (!trial.canApply) {
        return NextResponse.json({ error: freeTrialBlockedMessage(trial) }, { status: 403 });
      }
      // Within the trial — fall through and let the apply proceed.
    }

    // (The lapsed-Pro revenue-leak block that used to live here is now handled
    // above by resolvePlan downgrading an expired pro/daily to 'free' + the
    // "subscription expired" branch — one source of truth, no drift.)

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

      logInfo({
        event:   'applications.daypass_apply',
        user_id: user.id,
        sub_status: sub?.status ?? null,
        sub_end:    sub?.current_period_end ?? null,
      });

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

    // Fetch job details using admin client (bypasses RLS)
    const adminSupabase = createAdminSupabaseClient();
    const { data: job, error: jobError } = await adminSupabase
      .from('jobs')
      .select('id, title, company, logo, apply_url, apply_email')
      .eq('id', jobId)
      .maybeSingle();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
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
        auto_applied: autoApplied,
        steps,
      })
      .select()
      .single();

    if (insertError) {
      // 23505 = unique_violation. With the new applications_user_job_unique
      // constraint (migration: add_dedup_unique_constraints) we can now
      // distinguish a real DB error from the rapid-double-click race that
      // sneaks past the maybeSingle() pre-check above. Treat the
      // unique-violation as "already applied" — same 409 the pre-check
      // returns — so both paths look identical to the client.
      if ((insertError as any).code === '23505') {
        return NextResponse.json({ error: 'You have already applied to this job' }, { status: 409 });
      }
      // 23514 = check_violation. The free-trial enforcement trigger
      // (migration_v56) raises this with a `free_trial_*` message when a free
      // user is past their allowance/window. The route's pre-gate normally
      // catches that first, but a count→insert race can let it reach the
      // trigger — surface the same friendly 403 instead of an opaque 500.
      const insertMsg = (insertError as any).message ?? '';
      if ((insertError as any).code === '23514' && insertMsg.includes('free_trial')) {
        return NextResponse.json(
          { error: freeTrialBlockedMessage({ windowExpired: insertMsg.includes('window_expired') }) },
          { status: 403 },
        );
      }
      // 23514 from the day-pass cap (migration_v59): the count→insert race
      // slipped a concurrent apply past the pre-gate above and the trigger's
      // atomic cap caught it. Surface the same friendly 403 the pre-gate uses
      // instead of an opaque 500.
      if ((insertError as any).code === '23514' && insertMsg.includes('day_pass')) {
        return NextResponse.json(
          { error: 'You have reached the 10-application limit for your day pass. Upgrade to Pro for unlimited access.' },
          { status: 403 },
        );
      }
      // Surface a clear error — don't expose raw DB messages
      logError({ event: 'applications.insert_failed', user_id: user.id, error: insertError.message });
      return NextResponse.json(
        { error: 'Failed to save your application. Please try again.' },
        { status: 500 }
      );
    }

    // Increment the per-job applications counter. Never let it fail the
    // request, but DO surface failures — this function was silently missing
    // from the DB (migration_v26 added it), so the counter sat at 0 forever
    // while the faulty catch hid it. rpc() returns {error} for PostgREST
    // errors rather than throwing, so check it explicitly.
    try {
      const { error: incErr } = await adminSupabase.rpc('increment_applications', { job_id: jobId });
      if (incErr) logWarn({ event: 'applications.increment_failed', job_id: jobId, error: incErr.message });
    } catch (err: any) {
      logWarn({ event: 'applications.increment_threw', job_id: jobId, error: err?.message ?? String(err) });
    }

    // Bump profile_completion if this just crossed the ≥1-application
    // threshold. Fire-and-forget via waitUntil so the upload response
    // doesn't pay the recalc round-trip.
    waitUntil(recomputeAndPersistProfileCompletion({
      id:               user.id,
      email:            user.email,
      emailConfirmedAt: user.email_confirmed_at,
    }));

    return NextResponse.json({
      application: {
        ...transformApplication(application),
        applyUrl: job.apply_url ?? null,
        applyEmail: job.apply_email ?? null,
      },
    }, { status: 201 });
  } catch (err: any) {
    logError({ event: 'applications.post_failed', error: err?.message ?? String(err) });
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
