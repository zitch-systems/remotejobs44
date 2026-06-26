// app/api/admin/2fa/status/route.ts — is the current admin 2FA-verified?
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminUser } from '@/lib/admin/auth';
import { ADMIN_MFA_REQUIRED } from '@/lib/auth/mfa';
import { ADMIN_2FA_COOKIE, verifySession } from '@/lib/auth/admin-2fa-server';

export async function GET() {
  const admin = await getAdminUser();
  if (!admin.ok) return admin.res;
  const cookieStore = await cookies();
  const verified = verifySession(cookieStore.get(ADMIN_2FA_COOKIE)?.value, admin.adminId);
  return NextResponse.json({ required: ADMIN_MFA_REQUIRED, verified });
}
