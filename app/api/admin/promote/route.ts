// app/api/admin/promote/route.ts
// One-time route to promote the authenticated user to admin.
// Requires ADMIN_SETUP_SECRET env var to match the submitted secret.
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const setupSecret = process.env.ADMIN_SETUP_SECRET;
  if (!setupSecret) {
    return NextResponse.json({ error: 'ADMIN_SETUP_SECRET is not configured on this server.' }, { status: 503 });
  }

  let body: { secret?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.secret || body.secret !== setupSecret) {
    return NextResponse.json({ error: 'Invalid secret.' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated. Log in first.' }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from('profiles')
    .update({ role: 'admin', plan: 'admin' })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: `${user.email} promoted to admin. Reload the admin panel.` });
}
