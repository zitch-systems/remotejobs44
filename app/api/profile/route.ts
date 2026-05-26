// app/api/profile/route.ts — Get and upsert the current user's profile
// Called on login to ensure the profile row always exists.
// Also sends the welcome email on first profile creation, since Supabase's
// "auto-confirm signups" setting bypasses our /auth/callback handler.
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import { isHardcodedAdmin } from '@/lib/admin-emails';
import { sendEmail } from '@/lib/email/send';
import { welcomeEmail } from '@/lib/email/templates';

// Columns safe to expose to the owning user. Paystack identifiers
// (customer_code, subscription_code, email_token) are intentionally EXCLUDED
// from the response — the client never needs them, and they're best kept
// off-wire to limit exposure via logs, extensions, and crash reports.
const SAFE_PROFILE_COLS = 'id, email, name, plan, role, created_at, updated_at, profile_completion, plan_expires_at, suspended, suspended_reason';

// Compute the user's effective plan: if plan_expires_at is in the past, treat
// them as 'free' regardless of what profiles.plan says. The expire-pass cron
// runs once daily at 6 UTC (Vercel Hobby quota), so a Day Pass purchased at
// 7am UTC would otherwise show as 'daily' until ~6 UTC the next day — a
// ~23h window where the UI lies. /api/applications still gates correctly
// off subscriptions.current_period_end, so applies are already blocked.
function effectivePlan(profile: { plan?: string | null; plan_expires_at?: string | null; role?: string | null }): string {
  if (profile.role === 'admin') return 'admin';
  if (!profile.plan_expires_at) return profile.plan ?? 'free';
  if (new Date(profile.plan_expires_at) < new Date()) return 'free';
  return profile.plan ?? 'free';
}

// GET /api/profile — Fetch current user's profile (creates if missing)
export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
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

    if (profile) {
      const plan = effectivePlan(profile);
      const role = (profile.role !== 'admin' && isHardcodedAdmin(user.email)) ? 'admin' : (profile.role ?? 'user');
      return NextResponse.json({ profile: { ...profile, plan: role === 'admin' ? 'admin' : plan, role } });
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
      .select()
      .single();

    // First profile creation — fire-and-forget welcome email.
    // We hit this path on first login regardless of whether Supabase email
    // confirmation is on or off, so it covers the auto-confirm signup flow
    // where /auth/callback is never reached.
    if (!insertError && user.email) {
      const { subject, html } = welcomeEmail(name);
      sendEmail({ to: user.email, subject, html }).catch(err =>
        console.error('[welcome email]', err)
      );
    }

    if (insertError) {
      console.error('[GET /api/profile] insert error:', insertError.message);
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
    console.error('[GET /api/profile]', err);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
