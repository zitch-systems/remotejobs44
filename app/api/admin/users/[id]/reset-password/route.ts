// app/api/admin/users/[id]/reset-password/route.ts
// Admin-triggered password reset — sends Supabase's standard recovery email
// to the user's address. The user clicks the link and lands on /reset-password.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { recordAdminAction } from '@/lib/admin/audit';
import { requireAdmin } from '@/lib/admin/auth';
import { rateLimit } from '@/lib/rate-limit';
import { logError, logWarn } from '@/lib/log';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });

  // Per-target rate limit. An admin (or a compromised admin session)
  // can otherwise loop password resets for a single user — each call
  // sends a Supabase recovery email to their inbox, and Supabase's own
  // upstream rate-limit then locks ALL legitimate self-initiated
  // resets for that user until the window resets. 3/hour per target
  // is more than any real admin workflow needs.
  const rl = rateLimit(`reset-pwd:${id}`, 3, 60 * 60 * 1000);
  if (!rl.success) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    logWarn({ event: 'admin.reset_password.rate_limited', admin_email: auth.adminEmail, target_user_id: id });
    return NextResponse.json(
      { error: 'This user has been reset recently. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

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
  if (error) {
    // Don't echo Supabase auth API messages (can include rate-limit
    // info, user-state hints) — log server-side and return generic.
    logError({ event: 'admin.reset_password.failed', admin_email: auth.adminEmail, target_user_id: id, error: error.message });
    return NextResponse.json({ error: 'Could not send reset email. Please try again.' }, { status: 500 });
  }

  await recordAdminAction({
    adminId: auth.adminId, adminEmail: auth.adminEmail,
    action: 'user.reset_password', targetType: 'user', targetId: id,
    metadata: { sent_to: profile.email },
  });

  return NextResponse.json({ success: true, sent_to: profile.email });
}
