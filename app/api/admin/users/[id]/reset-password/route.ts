// app/api/admin/users/[id]/reset-password/route.ts
// Admin-triggered password reset — sends Supabase's standard recovery email
// to the user's address. The user clicks the link and lands on /reset-password.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { recordAdminAction } from '@/lib/admin/audit';
import { requireAdmin } from '@/lib/admin/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });

  const supabase = createAdminSupabaseClient();
  // Look up the user's email — we need it for the resetPasswordForEmail call.
  const { data: profile } = await supabase.from('profiles').select('email').eq('id', id).maybeSingle();
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
    action: 'user.reset_password', targetType: 'user', targetId: id,
    metadata: { sent_to: profile.email },
  });

  return NextResponse.json({ success: true, sent_to: profile.email });
}
