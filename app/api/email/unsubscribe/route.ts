// app/api/email/unsubscribe/route.ts
//
// Honours the signed links in the footer (and the List-Unsubscribe header) of
// every bulk email we send. Deliberately unauthenticated: the whole point is
// that someone who no longer wants our mail can stop it without first
// remembering a password. The HMAC in the query string is the authorisation,
// and it grants exactly one capability — set one key in this one user's
// profiles.email_prefs to false. See lib/email/unsubscribe.ts.
//
// POST is the RFC 8058 one-click path that Gmail/Yahoo call directly from
// their UI (no redirect, no body, no confirmation). GET is the human path for
// someone clicking the footer link, and renders a small confirmation page.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { isUnsubscribeTopic, verifyUnsubscribeToken, type UnsubscribeTopic } from '@/lib/email/unsubscribe';
import { logError, logInfo, logWarn } from '@/lib/log';

const TOPIC_LABEL: Record<UnsubscribeTopic, string> = {
  marketing:       'marketing emails',
  job_alerts:      'job alert emails',
  product_updates: 'product update emails',
};

function page(title: string, body: string, status: number): NextResponse {
  // Self-contained HTML: this page is reached from a mail client, often in an
  // in-app browser, and must not depend on the app bundle rendering.
  return new NextResponse(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · RemoteJobs44</title></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:520px;margin:64px auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
  <h1 style="margin:0 0 12px;font-size:20px;color:#1c1917">${title}</h1>
  <p style="margin:0 0 24px;color:#57534e;line-height:1.6">${body}</p>
  <a href="https://remotejobs44.com/profile" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Manage all email settings →</a>
</div>
</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

/**
 * Verifies the signature and flips the topic off. Returns null on success or
 * a short failure reason.
 *
 * Merges into the existing jsonb rather than overwriting it so unsubscribing
 * from one topic can't silently reset the others to their defaults.
 */
async function applyUnsubscribe(req: NextRequest): Promise<{ topic: UnsubscribeTopic } | { error: string; status: number }> {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('u') ?? '';
  const topic  = searchParams.get('t') ?? '';
  const token  = searchParams.get('s');

  if (!isUnsubscribeTopic(topic)) {
    return { error: 'This unsubscribe link is not valid.', status: 400 };
  }
  if (!verifyUnsubscribeToken(userId, topic, token)) {
    // Don't distinguish "bad signature" from "unknown user" — that would turn
    // the endpoint into an account-existence oracle.
    logWarn({ event: 'email.unsubscribe_bad_token', topic });
    return { error: 'This unsubscribe link is not valid or has expired.', status: 400 };
  }

  try {
    const admin = createAdminSupabaseClient();
    const { data: profile, error: readErr } = await admin
      .from('profiles')
      .select('email_prefs')
      .eq('id', userId)
      .maybeSingle();

    if (readErr) {
      logError({ event: 'email.unsubscribe_read_failed', user_id: userId, error: readErr.message });
      return { error: 'Something went wrong. Please try again in a moment.', status: 500 };
    }
    // A valid signature for a deleted account: nothing to switch off, and
    // reporting success is both true (they will receive no more mail) and
    // non-disclosing.
    if (!profile) return { topic };

    const prefs = { ...((profile.email_prefs as Record<string, boolean> | null) ?? {}), [topic]: false };
    const { error: writeErr } = await admin
      .from('profiles')
      .update({ email_prefs: prefs, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (writeErr) {
      logError({ event: 'email.unsubscribe_write_failed', user_id: userId, topic, error: writeErr.message });
      return { error: 'Something went wrong. Please try again in a moment.', status: 500 };
    }

    logInfo({ event: 'email.unsubscribed', user_id: userId, topic });
    return { topic };
  } catch (err) {
    logError({
      event: 'email.unsubscribe_unhandled',
      error: (err as Error)?.message ?? String(err),
    });
    return { error: 'Something went wrong. Please try again in a moment.', status: 500 };
  }
}

// One-click (RFC 8058). Mail providers POST here with no body and expect a
// 2xx; anything else and they may stop surfacing the native unsubscribe
// button for our domain.
export async function POST(req: NextRequest) {
  const result = await applyUnsubscribe(req);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: true, topic: result.topic });
}

// Human path — the footer link.
export async function GET(req: NextRequest) {
  const result = await applyUnsubscribe(req);
  if ('error' in result) {
    return page(
      'Unsubscribe failed',
      `${result.error} You can change every email setting from your profile.`,
      result.status,
    );
  }
  return page(
    'You’re unsubscribed',
    `You will no longer receive ${TOPIC_LABEL[result.topic]} from RemoteJobs44. ` +
    'Account and billing emails are unaffected.',
    200,
  );
}
