// app/api/admin/2fa/send/route.ts — email an admin a fresh login code.
import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send';
import { adminLoginCodeEmail } from '@/lib/email/templates';
import { rateLimit } from '@/lib/rate-limit';
import { generateCode, hashCode, ADMIN_2FA_EMAIL, CODE_TTL_MS } from '@/lib/auth/admin-2fa-server';
import { logError, logInfo } from '@/lib/log';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const shown = local.slice(0, 2);
  return `${shown}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export async function POST(_req: NextRequest) {
  // getAdminUser (NOT requireAdmin): this endpoint must be reachable BEFORE the
  // admin has passed 2FA — it's how they get the code.
  const admin = await getAdminUser();
  if (!admin.ok) return admin.res;

  // Throttle code requests per admin (5 per 10 minutes) to prevent inbox spam
  // / brute-forcing fresh codes.
  const rl = rateLimit(`admin2fa:send:${admin.adminId}`, 5, 10 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many code requests. Please wait a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) } },
    );
  }

  const code = generateCode();
  const db = createAdminSupabaseClient();

  // Housekeeping (hardening phase 1): dead rows — consumed, or past expiry —
  // were never deleted anywhere, so the table grew forever. Purge this
  // admin's stale rows whenever a fresh code is issued; the rows are inert
  // by definition (verify filters consumed_at IS NULL AND expires_at > now),
  // so this cannot change any auth outcome. Fire-and-forget: a purge failure
  // must never block a login code.
  db.from('admin_2fa_codes')
    .delete()
    .eq('user_id', admin.adminId)
    .or(`consumed_at.not.is.null,expires_at.lt.${new Date().toISOString()}`)
    .then(({ error }) => {
      if (error) logError({ event: 'admin2fa.purge_failed', user_id: admin.adminId, error: error.message });
    });

  const { error: insErr } = await db.from('admin_2fa_codes').insert({
    user_id:    admin.adminId,
    code_hash:  hashCode(admin.adminId, code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (insErr) {
    logError({ event: 'admin2fa.code_insert_failed', user_id: admin.adminId, error: insErr.message });
    return NextResponse.json({ error: 'Could not generate a code. Please try again.' }, { status: 500 });
  }

  // The code stays OUT of the subject and the inbox preview line. Both render
  // in lock-screen notifications without the phone being unlocked, and they
  // are the part of a message that gets retained in mail server logs and
  // search indexes — a second factor that shows up on a locked screen is not
  // much of a second factor. adminLoginCodeEmail() keeps both clean.
  const { subject, html } = adminLoginCodeEmail(code, Math.round(CODE_TTL_MS / 60_000));
  const sent = await sendEmail({ to: ADMIN_2FA_EMAIL, subject, html });
  if (!sent) {
    logError({ event: 'admin2fa.email_failed', user_id: admin.adminId });
    return NextResponse.json({ error: 'Could not send the code email. Check email configuration.' }, { status: 502 });
  }

  logInfo({ event: 'admin2fa.code_sent', user_id: admin.adminId });
  return NextResponse.json({ ok: true, sentTo: maskEmail(ADMIN_2FA_EMAIL) });
}
