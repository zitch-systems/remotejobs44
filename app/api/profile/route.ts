// app/api/profile/route.ts — Get and upsert the current user's profile
// Called on login to ensure the profile row always exists.
// Also sends the welcome email on first profile creation, since Supabase's
// "auto-confirm signups" setting bypasses our /auth/callback handler.
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import { isHardcodedAdmin } from '@/lib/admin-emails';
import { sendEmail } from '@/lib/email/send';
import { welcomeEmail } from '@/lib/email/templates';
import { resolvePlan } from '@/lib/auth/plan';
import { computeProfileCompletion } from '@/lib/auth/profile-completion';
import { logError } from '@/lib/log';
import { waitUntil } from '@vercel/functions';

// Columns safe to expose to the owning user. Paystack identifiers
// (customer_code, subscription_code, email_token) are intentionally EXCLUDED
// from the response — the client never needs them, and they're best kept
// off-wire to limit exposure via logs, extensions, and crash reports.
const SAFE_PROFILE_COLS = 'id, email, name, plan, role, created_at, updated_at, profile_completion, plan_expires_at, suspended, suspended_reason, cv_url';

// GET /api/profile — Fetch current user's profile (creates if missing)
//
// The expire-pass cron runs once daily at 6 UTC (Vercel Hobby quota), so a
// Day Pass purchased at 7am UTC would otherwise show as 'daily' until ~6
// UTC the next day. We surface the *effective* plan computed from
// plan_expires_at via resolvePlan() so the UI doesn't lie during that
// ~23h window. /api/applications still gates correctly off
// subscriptions.current_period_end, so applies are already blocked.
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();

    const { data: profile, error } = await admin
      .from('profiles')
      .select(SAFE_PROFILE_COLS)
      .eq('id', user.id)
      .maybeSingle();

    // CRITICAL: if SELECT errored (network blip, transient Supabase issue),
    // `profile` is null but the row may actually exist with plan='daily' /
    // 'pro'. Without this guard we'd fall through to the upsert path
    // which writes plan='free' onConflict — clobbering a paying user.
    // Return 500 so the client can retry rather than mis-creating state.
    if (error) {
      logError({ event: 'profile.select_failed', user_id: user.id, error: error.message });
      return NextResponse.json({ error: 'Failed to read profile' }, { status: 500 });
    }

    if (profile) {
      const role = (profile.role !== 'admin' && isHardcodedAdmin(user.email)) ? 'admin' : (profile.role ?? 'user');
      const plan = resolvePlan({
        role,
        dbPlan: profile.plan,
        planExpiresAt: profile.plan_expires_at,
      });
      // Profile completion %: recompute against the current signals
      // (name, email_confirmed_at, cv_url, application count, saved
      // count) so the ring on /profile and /dashboard reflects reality
      // instead of the hardcoded 20/80 the column used to be stuck on.
      // Counts use head:true so we don't pay row payload to count.
      const [{ count: applicationsCount }, { count: savedJobsCount }] = await Promise.all([
        admin.from('applications').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        admin.from('saved_jobs').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);
      const computed = computeProfileCompletion({
        name:              profile.name,
        email:             profile.email,
        emailConfirmedAt:  user.email_confirmed_at,
        cvUrl:             profile.cv_url,
        applicationsCount: applicationsCount ?? 0,
        savedJobsCount:    savedJobsCount ?? 0,
      });
      // Write-back when it drifted from the stored value. waitUntil
      // keeps the lambda alive past the JSON response so Vercel
      // doesn't kill the request before the UPDATE lands — without
      // it the write-back was effectively never persisted on cold
      // serverless invocations.
      if (computed !== (profile.profile_completion ?? 0)) {
        // Promise.resolve() unwraps Supabase's PostgrestBuilder (a
        // PromiseLike, not a real Promise) into the Promise<T> shape
        // waitUntil expects.
        waitUntil(Promise.resolve(
          admin.from('profiles')
            .update({ profile_completion: computed, updated_at: new Date().toISOString() })
            .eq('id', user.id)
            .then(({ error: writeErr }) => {
              if (writeErr) logError({ event: 'profile.completion_writeback_failed', user_id: user.id, error: writeErr.message });
            })
        ));
      }
      return NextResponse.json({
        profile: { ...profile, plan, role, profile_completion: computed },
      });
    }

    // Profile missing — create it now (handles users who signed up before trigger was added)
    const name = user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'User';
    const isAdmin = isHardcodedAdmin(user.email);

    const { data: newProfile, error: insertError } = await admin
      .from('profiles')
      .upsert({
        id:                 user.id,
        name:               name,
        email:              user.email,
        plan:               isAdmin ? 'admin' : 'free',
        role:               isAdmin ? 'admin' : 'user',
        profile_completion: 20,
      }, { onConflict: 'id' })
      // Re-select via SAFE_PROFILE_COLS so the response shape matches the
      // happy path and we don't leak paystack_* columns.
      .select(SAFE_PROFILE_COLS)
      .single();

    // First profile creation — fire-and-forget welcome email.
    // We hit this path on first login regardless of whether Supabase email
    // confirmation is on or off, so it covers the auto-confirm signup flow
    // where /auth/callback is never reached.
    if (!insertError && user.email) {
      const { subject, html } = welcomeEmail(name);
      sendEmail({ to: user.email, subject, html }).catch(err =>
        logError({ event: 'profile.welcome_email_failed', user_id: user.id, error: err?.message ?? String(err) })
      );
    }

    if (insertError) {
      logError({ event: 'profile.insert_failed', user_id: user.id, error: insertError.message });
      // Return a safe fallback profile even if DB write fails
      return NextResponse.json({
        profile: {
          id:   user.id,
          name: name,
          plan: isAdmin ? 'admin' : 'free',
          role: isAdmin ? 'admin' : 'user',
          profile_completion: 20,
        }
      });
    }

    return NextResponse.json({ profile: newProfile });
  } catch (err: any) {
    logError({ event: 'profile.unhandled', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
