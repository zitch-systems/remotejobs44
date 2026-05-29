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
import { logError } from '@/lib/log';

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
      return NextResponse.json({ profile: { ...profile, plan, role } });
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
