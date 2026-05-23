// app/api/profile/route.ts — Get and upsert the current user's profile
// Called on login to ensure the profile row always exists
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';

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
      return NextResponse.json({ profile });
    }

    // Profile missing — create it now (handles users who signed up before trigger was added)
    const name = user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'User';
    const ADMIN_EMAILS = ['admin@remotejobs44.com', 'admin@remotejobs4.com', 'zitchinfo@gmail.com'];
    const isAdmin = ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? '');

    const { data: newProfile, error: insertError } = await admin
      .from('profiles')
      .upsert({
        id:                 user.id,
        name:               name,
        plan:               isAdmin ? 'admin' : 'free',
        role:               isAdmin ? 'admin' : 'user',
        profile_completion: 20,
      }, { onConflict: 'id' })
      .select()
      .single();

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
