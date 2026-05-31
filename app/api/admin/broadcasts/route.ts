// app/api/admin/broadcasts/route.ts
//
// Admin broadcast email composer. Send a single subject + html body
// out to a slice of registered users, filtered by plan and email-
// confirmed status. Resend handles the actual delivery; this route
// orchestrates the fan-out and writes the audit row.
//
// Body:
//   { subject: string,
//     html:    string,
//     plan:    'all' | 'free' | 'daily' | 'pro',
//     onlyConfirmed: boolean,
//     testTo?: string                // when set, send ONLY to that
//                                    // address — preview pass before
//                                    // the real fan-out
//   }
//
// Safety gates:
//   * admin-gated end-to-end via requireAdmin
//   * test sends bypass the audience filter so an admin can
//     QA the template against their own inbox first
//   * a single broadcast is hard-capped at 5,000 recipients to keep
//     Resend quota usage bounded and to leave room for a confirm
//     prompt on the UI side; anything bigger needs to be split
//   * 4s pause between 100-row chunks so we never exceed Resend's
//     free-tier 100 emails/sec ceiling
//   * always writes a settings.broadcast_sent audit row with counts
//     so the action is traceable
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { recordAdminAction } from '@/lib/admin/audit';
import { sendEmail } from '@/lib/email/send';
import { logError, logInfo, logWarn } from '@/lib/log';

// 500 recipients × 1.1s inter-chunk pause × 100/chunk = ~5.5s of
// scheduled pauses, plus the actual sendEmail latency. Fits well
// inside the 60s Vercel ceiling. The previous 5,000 cap would have
// timed out hard at ~55s of pauses alone before any send landed.
// Anything bigger needs a background worker, not a longer lambda.
export const maxDuration = 60;

const ALLOWED_PLANS = new Set(['all', 'free', 'daily', 'pro']);
const MAX_RECIPIENTS = 500;
const CHUNK_SIZE     = 100;
const CHUNK_PAUSE_MS = 1100;
const EMAIL_RE       = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

interface Body {
  subject?:       string;
  html?:          string;
  plan?:          string;
  onlyConfirmed?: boolean;
  testTo?:        string;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  let body: Body = {};
  try { body = await req.json(); } catch {}

  const subject = String(body.subject ?? '').trim().slice(0, 200);
  const html    = String(body.html ?? '').trim().slice(0, 50_000);
  const plan    = String(body.plan ?? 'all');
  const onlyConfirmed = body.onlyConfirmed !== false; // default true

  if (!subject || !html) {
    return NextResponse.json({ error: 'subject and html body are required' }, { status: 400 });
  }
  if (!ALLOWED_PLANS.has(plan)) {
    return NextResponse.json({ error: 'plan must be one of all, free, daily, pro' }, { status: 400 });
  }

  // ── Test send branch ─────────────────────────────────────────────
  // The composer offers a "send test to me first" button so admins
  // verify rendering + spam-folder placement against a known address
  // before the real fan-out. Bypasses the audience filter entirely.
  if (typeof body.testTo === 'string' && body.testTo.trim()) {
    const testTo = body.testTo.trim().toLowerCase();
    if (!EMAIL_RE.test(testTo)) {
      return NextResponse.json({ error: 'Invalid testTo address' }, { status: 400 });
    }
    const ok = await sendEmail({ to: testTo, subject: `[TEST] ${subject}`, html });
    await recordAdminAction({
      adminId: auth.adminId, adminEmail: auth.adminEmail,
      action: 'broadcast.test_send', targetType: null, targetId: null,
      metadata: { to: testTo, subject, plan, only_confirmed: onlyConfirmed, ok },
    });
    if (!ok) return NextResponse.json({ error: 'Test send failed.' }, { status: 500 });
    return NextResponse.json({ success: true, mode: 'test', sentTo: testTo });
  }

  // ── Audience resolve ─────────────────────────────────────────────
  const supabase = createAdminSupabaseClient();
  let q = supabase
    .from('profiles')
    .select('id, email, name, plan')
    .not('email', 'is', null)
    .limit(MAX_RECIPIENTS + 1); // +1 so we can detect the cap was hit

  if (plan !== 'all') q = q.eq('plan', plan);

  // Confirmed-only filter requires a join against auth.users. The
  // profiles table doesn't carry email_confirmed_at, but profiles.id
  // = auth.users.id, so we resolve the auth set first and intersect.
  //
  // listUsers caps at 1000 rows per call (Supabase Admin SDK
  // default + max). At total > 1000 the previous single-page call
  // silently excluded confirmed users on page 2+ from EVERY
  // broadcast — they'd never receive a message. Paginate until a
  // short page lands or we hit the hard cap, which corresponds to
  // MAX_PAGES_TOTAL × PAGE_SIZE auth users.
  let confirmedIds: Set<string> | null = null;
  if (onlyConfirmed) {
    const PAGE_SIZE       = 1000;
    const MAX_PAGES_TOTAL = 10; // up to 10k auth users
    const acc = new Set<string>();
    for (let page = 1; page <= MAX_PAGES_TOTAL; page++) {
      const { data, error: authErr } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
      if (authErr) {
        logError({ event: 'broadcast.list_users_failed', admin_email: auth.adminEmail, page, error: authErr.message });
        return NextResponse.json({ error: 'Failed to resolve audience.' }, { status: 500 });
      }
      for (const u of data.users) {
        if (u.email_confirmed_at) acc.add(u.id);
      }
      // A short page = last page. SDK doesn't expose a total count.
      if (data.users.length < PAGE_SIZE) break;
      if (page === MAX_PAGES_TOTAL) {
        // Hard cap hit — log so we know when the simple paginator
        // outgrows itself and we need to refactor to a streaming
        // join. At 10k auth users we already need a different shape
        // for the broadcast anyway.
        logWarn({ event: 'broadcast.list_users_capped', admin_email: auth.adminEmail, pages: MAX_PAGES_TOTAL });
      }
    }
    confirmedIds = acc;
  }

  const { data: rawProfiles, error: profileErr } = await q;
  if (profileErr) {
    logError({ event: 'broadcast.profile_query_failed', admin_email: auth.adminEmail, error: profileErr.message });
    return NextResponse.json({ error: 'Failed to resolve audience.' }, { status: 500 });
  }

  let recipients = (rawProfiles ?? []).filter((p: { id: string; email: string | null }) =>
    p.email && EMAIL_RE.test(p.email)
  ) as Array<{ id: string; email: string; name: string | null; plan: string }>;

  if (confirmedIds) {
    recipients = recipients.filter(r => confirmedIds!.has(r.id));
  }

  const overCap = recipients.length > MAX_RECIPIENTS;
  recipients = recipients.slice(0, MAX_RECIPIENTS);

  if (recipients.length === 0) {
    return NextResponse.json({
      success: false,
      reason: 'no_recipients',
      audience_count: 0,
    }, { status: 200 });
  }

  // ── Fan-out ──────────────────────────────────────────────────────
  // Sequential chunks with a small pause so Resend's free tier rate
  // limit isn't tripped. Resend's per-call limit is per-API-key, so
  // parallel chunks within the same handler would still serialise on
  // their side — the pause is the cleaner approach.
  let sent   = 0;
  let failed = 0;
  for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
    const chunk = recipients.slice(i, i + CHUNK_SIZE);
    const results = await Promise.allSettled(chunk.map(r =>
      sendEmail({ to: r.email, subject, html })
    ));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value === true) sent++;
      else failed++;
    }
    if (i + CHUNK_SIZE < recipients.length) {
      await new Promise(res => setTimeout(res, CHUNK_PAUSE_MS));
    }
  }

  if (failed > 0) {
    logWarn({ event: 'broadcast.partial_failure', admin_email: auth.adminEmail, sent, failed, total: recipients.length });
  }
  logInfo({ event: 'broadcast.sent', admin_email: auth.adminEmail, sent, failed, audience: recipients.length, plan, only_confirmed: onlyConfirmed });

  await recordAdminAction({
    adminId: auth.adminId, adminEmail: auth.adminEmail,
    action: 'broadcast.send', targetType: null, targetId: null,
    metadata: {
      subject,
      plan,
      only_confirmed: onlyConfirmed,
      audience: recipients.length,
      sent,
      failed,
      capped: overCap,
    },
  });

  return NextResponse.json({
    success: true,
    audience_count: recipients.length,
    sent,
    failed,
    capped: overCap,
  });
}
