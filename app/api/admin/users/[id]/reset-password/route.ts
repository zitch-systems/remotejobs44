// app/api/admin/users/[id]/reset-password/route.ts
// Admin-triggered password reset — sends Supabase's standard recovery email
// to the user's address. The user clicks the link and lands on /reset-password.
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import { isHardcodedAdmin } from '@/lib/admin-emails';
import { recordAdminAction } from '@/lib/admin/audit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdmin(): Promise<{ ok: false } | { ok: true; adminId: string; adminEmail: string | null }> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isAdmin = profile?.role === 'admin' || isHardcodedAdmin(user.email);
  if (!isAdmin) return { ok: false };
  return { ok: true, adminId: user.id, adminEmail: user.email ?? null };
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });

  const supabase = createAdminSupabaseClient();
  // Look up the user's email — we need it for the resetPasswordForEmail call.
  const { data: profile } = await supabase.from('profiles').select('email').eq('id', params.id).maybeSingle();
  if (!profile?.email) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // generateLink with type='recovery' returns a magic link; admin.inviteUserByEmail
  // would re-trigger signup. Sending via resetPasswordForEmail keeps the UX the
  // same as a user-initiated "forgot password" flow.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
    redirectTo: appUrl ? `${appUrl}/reset-password` : undefined,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAdminAction({
    adminId: auth.adminId, adminEmail: auth.adminEmail,
    action: 'user.reset_password', targetType: 'user', targetId: params.id,
    metadata: { sent_to: profile.email },
  });

  return NextResponse.json({ success: true, sent_to: profile.email });
}
