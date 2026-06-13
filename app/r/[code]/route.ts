// app/r/[code]/route.ts
// The public referral link an agent shares: https://remotejobs44.com/r/<code>
//
// On each hit we (1) record a click for the agent's stats, (2) drop a
// 30-day `rj44_ref` cookie so the visitor is attributed to this agent
// whenever they eventually register, and (3) bounce them to the homepage to
// browse. Attribution survives the browse → sign-up gap via the cookie, so
// the agent gets credit even if the visitor doesn't register on first visit.
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { getIP, rateLimit } from '@/lib/rate-limit';
import { logError } from '@/lib/log';

// Same shape as the codes randomReferralCode mints, with slack for any
// future human-readable codes. Reject anything else before touching the DB.
const CODE_RE = /^[A-Za-z0-9_-]{1,40}$/;

// 30 days — long enough to bridge "saw the link today, signed up next week".
const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// Flood guard for the click-log write. /r/<code> is an unauthenticated public
// endpoint, so without this a script could hammer a valid link to inflate an
// agent's click count and bloat referral_clicks unbounded. 30 recorded clicks
// per IP per minute is far above any human, but caps a single-source flood.
// The cookie + redirect ALWAYS run — only the DB insert is throttled — so
// attribution is never affected. Generous on purpose: Nigerian carrier-grade
// NAT means many real users share one IP.
const CLICK_WRITES_PER_IP = 30;
const CLICK_WINDOW_MS = 60 * 1000;

function hashIp(ip: string): string {
  const salt = process.env.REFERRAL_IP_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'rj44';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const home = new URL('/', request.url);

  if (!code || !CODE_RE.test(code)) {
    // Malformed link — just send them to the homepage, no cookie, no click.
    return NextResponse.redirect(home);
  }

  try {
    const admin = createAdminSupabaseClient();
    const { data: agent } = await admin
      .from('profiles')
      .select('id, role')
      .eq('referral_code', code)
      .maybeSingle();

    // Unknown / non-agent code → don't set a cookie or record anything;
    // a stale or guessed link shouldn't attribute future signups to nobody.
    if (!agent || agent.role !== 'agent') {
      return NextResponse.redirect(home);
    }

    // Record the click. Best-effort — a logging hiccup must not stop the
    // redirect or the cookie (attribution still works without the click row).
    // Throttled per IP so a flood can't inflate counts or bloat the table;
    // when throttled we skip the write but still cookie + redirect below.
    const ip = getIP(request);
    if (rateLimit(`ref-click:${ip}`, CLICK_WRITES_PER_IP, CLICK_WINDOW_MS).success) {
      try {
        await admin.from('referral_clicks').insert({
          agent_id:      agent.id,
          referral_code: code,
          path:          request.nextUrl.searchParams.get('p')?.slice(0, 300) ?? null,
          referrer:      request.headers.get('referer')?.slice(0, 500) ?? null,
          ip_hash:       hashIp(ip),
          user_agent:    request.headers.get('user-agent')?.slice(0, 500) ?? null,
        });
      } catch (err: any) {
        logError({ event: 'referral.click_insert_failed', error: err?.message ?? String(err), code });
      }
    }

    const res = NextResponse.redirect(home);
    res.cookies.set('rj44_ref', code, {
      path: '/',
      maxAge: REF_COOKIE_MAX_AGE,
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  } catch (err: any) {
    logError({ event: 'referral.redirect_failed', error: err?.message ?? String(err), code });
    return NextResponse.redirect(home);
  }
}
