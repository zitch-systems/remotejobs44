// app/api/admin/2fa/verify/route.ts — verify an emailed code, set 2FA cookie.
import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import {
  hashCode, signSession, ADMIN_2FA_COOKIE, sessionCookieOptions, MAX_CODE_ATTEMPTS,
} from '@/lib/auth/admin-2fa-server';
import { logInfo, logWarn } from '@/lib/log';

export async function POST(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin.ok) return admin.res;

  // Throttle verify attempts per admin to blunt online brute-forcing of the
  // 6-digit code (10 per 10 min, on top of the per-code attempt cap below).
  const rl = rateLimit(`admin2fa:verify:${admin.adminId}`, 10, 10 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many attempts. Please wait a few minutes.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const code = typeof body?.code === 'string' ? body.code.replace(/\D/g, '') : '';
  if (code.length < 6) {
    return NextResponse.json({ error: 'Enter the 6-digit code from the email.' }, { status: 400 });
  }

  const db = createAdminSupabaseClient();
  // Compare and consume/increment under a row lock in Postgres. A read followed
  // by an update lets concurrent requests reuse the same attempts value.
  const submittedHash = hashCode(admin.adminId, code);
  const { data: result, error } = await db.rpc('verify_admin_2fa_code', {
    p_user_id: admin.adminId,
    p_submitted_hash: submittedHash,
    p_max_attempts: MAX_CODE_ATTEMPTS,
  });
  if (error) {
    return NextResponse.json({ error: 'Unable to verify code. Please retry.' }, { status: 503 });
  }
  const status = typeof result === 'string' ? result : result?.status;
  if (status === 'missing') {
    return NextResponse.json({ error: 'No active code — request a new one.' }, { status: 400 });
  }
  if (status === 'locked') {
    return NextResponse.json({ error: 'Too many wrong attempts — request a new code.' }, { status: 400 });
  }
  if (status !== 'verified') {
    logWarn({ event: 'admin2fa.code_mismatch', user_id: admin.adminId });
    return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 });
  }

  // The RPC has atomically burned the code; issue the signed session cookie.
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_2FA_COOKIE, signSession(admin.adminId), sessionCookieOptions);
  logInfo({ event: 'admin2fa.verified', user_id: admin.adminId });
  return res;
}
