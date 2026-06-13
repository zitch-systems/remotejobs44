// app/api/referral/attribute/route.ts
// Called by the register flow right after a successful signup. Reads the
// `rj44_ref` cookie (dropped by /r/<code>) and stamps the new user's
// profiles.referred_by with the referring agent — once. Safe to call for any
// logged-in user: attributeReferral only writes when referred_by is still
// null, so an established user can't be (re)attributed by a stray cookie.
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import { attributeReferral } from '@/lib/referral/attribution';

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    // No session (e.g. an email-confirm-required signup). Nothing to do here —
    // /auth/callback attributes from the same cookie at first login.
    return NextResponse.json({ ok: false, attributed: false });
  }

  const cookieStore = await cookies();
  let code: string | null = cookieStore.get('rj44_ref')?.value ?? null;
  if (!code) {
    try {
      const body = await req.json();
      if (typeof body?.code === 'string') code = body.code;
    } catch {}
  }
  if (!code) return NextResponse.json({ ok: true, attributed: false });

  const admin = createAdminSupabaseClient();
  const { attributed } = await attributeReferral(admin, { userId: user.id, code });

  const res = NextResponse.json({ ok: true, attributed });
  // One-shot: drop the cookie so a later signup on a shared browser isn't
  // mis-credited to this agent.
  res.cookies.set('rj44_ref', '', { path: '/', maxAge: 0 });
  return res;
}
