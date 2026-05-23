// app/api/profile/route.ts — Get and upsert the current user's profile
// Called on login to ensure the profile row always exists.
// Also sends the welcome email on first profile creation, since Supabase's
// "auto-confirm signups" setting bypasses our /auth/callback handler.
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import { isHardcodedAdmin } from '@/lib/admin-emails';
import { sendEmail } from '@/lib/email/send';
import { welcomeEmail } from '@/lib/email/templates';

// GET /api/profile — Fetch current user's profile (creates if missing)
export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();

    // Try to fetch existing profile
    const { data: profile, error } = await admin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profile) {
      // If user is a hardcoded admin but their DB row says 'user', upgrade the response (does not write to DB)
      if (profile.role !== 'admin' && isHardcodedAdmin(user.email)) {
        return NextResponse.json({ profile: { ...profile, role: 'admin', plan: 'admin' } });
      }
      return NextResponse.json({ profile });
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
