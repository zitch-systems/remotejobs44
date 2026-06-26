// app/api/admin/2fa/send/route.ts — email an admin a fresh login code.
import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send';
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
  const { error: insErr } = await db.from('admin_2fa_codes').insert({
    user_id:    admin.adminId,
    code_hash:  hashCode(admin.adminId, code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (insErr) {
    logError({ event: 'admin2fa.code_insert_failed', user_id: admin.adminId, error: insErr.message });
    return NextResponse.json({ error: 'Could not generate a code. Please try again.' }, { status: 500 });
  }

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#1c1917">RemoteJobs44 admin login code</h2>
      <p style="color:#57534e">Use this code to finish signing in to the admin area. It expires in 10 minutes.</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#1d4ed8;margin:24px 0">${code}</p>
      <p style="color:#a8a29e;font-size:12px">If you didn't try to sign in, ignore this email and consider changing the admin password.</p>
    </div>`;
  const sent = await sendEmail({
    to:      ADMIN_2FA_EMAIL,
    subject: `RemoteJobs44 admin login code: ${code}`,
    html,
  });
  if (!sent) {
    logError({ event: 'admin2fa.email_failed', user_id: admin.adminId });
    return NextResponse.json({ error: 'Could not send the code email. Check email configuration.' }, { status: 502 });
  }

  logInfo({ event: 'admin2fa.code_sent', user_id: admin.adminId });
  return NextResponse.json({ ok: true, sentTo: maskEmail(ADMIN_2FA_EMAIL) });
}
