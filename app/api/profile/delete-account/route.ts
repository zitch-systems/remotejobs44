// app/api/profile/delete-account/route.ts
// GDPR-style "delete my account" — wipes the user from auth.users; FKs
// cascade through profiles, applications, saved_jobs, subscriptions.
//
// Guard: requires `confirm=DELETE` in the body so a stray POST can't nuke
// an account. We also block admins from self-deleting via this endpoint —
// they'd disappear from their own admin panel mid-action.
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { confirm?: string } = {};
  try { body = await req.json(); } catch {}
  if (body.confirm !== 'DELETE') {
    return NextResponse.json({ error: 'Missing or invalid confirmation' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // Admins must demote themselves first (via Supabase dashboard) before
  // self-deleting — keeps the panel from losing its last operator.
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role === 'admin') {
    return NextResponse.json(
      { error: 'Admin accounts must be demoted by another admin before deletion.' },
      { status: 400 }
    );
  }

  // Mark any subscription as cancelled so the next webhook event doesn't
  // try to update a row that points at a deleted user.
  await admin.from('subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('user_id', user.id);

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    console.error('[delete-account] failed:', delErr.message);
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // Sign the user out server-side so their cookies are invalidated before
  // the client receives the response.
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
