// app/api/webhooks/resend/route.ts — bounce + complaint feedback loop.
//
// Before this existed the app had no idea what happened to a message after
// handing it to Resend. Resend suppresses an address on its own side after
// a hard bounce, so those users simply stopped receiving mail while every
// screen in the product still showed them as ordinary, mailable accounts.
// Spam complaints were worse: invisible, and we would keep including the
// complainant in the next broadcast — which is how one annoyed recipient
// turns into a domain reputation problem that takes the transactional
// confirm/reset mail down with it.
//
// Configure in Resend → Webhooks, pointing at /api/webhooks/resend, and put
// the signing secret in RESEND_WEBHOOK_SECRET.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { verifyResendSignature, isPermanentBounce, recipientsOf } from '@/lib/email/webhook';
import { logError, logInfo } from '@/lib/log';

// Never prerender or cache; this is a signed POST endpoint.
export const dynamic = 'force-dynamic';

// Topics a complaint revokes. `billing` is deliberately absent — receipts
// and payment failures are transactional records of money changing hands,
// not marketing, and a user who reported a newsletter still needs to be
// told their card was declined.
const OPT_OUT_ON_COMPLAINT = ['marketing', 'job_alerts', 'product_updates'] as const;

export async function POST(req: NextRequest) {
  // Read the body as TEXT. The HMAC is computed over the exact bytes sent;
  // parsing to JSON and re-serialising would not round-trip and every
  // signature check would fail.
  const raw = await req.text();

  const ok = verifyResendSignature(
    raw,
    {
      id:        req.headers.get('svix-id'),
      timestamp: req.headers.get('svix-timestamp'),
      signature: req.headers.get('svix-signature'),
    },
    process.env.RESEND_WEBHOOK_SECRET,
  );
  if (!ok) {
    // Deliberately terse. A forger shouldn't learn whether the secret is
    // unset, the timestamp stale, or the digest simply wrong.
    logError({ event: 'resend.webhook.bad_signature' });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const type = String(event?.type ?? '');
  const data = event?.data ?? {};
  const emails = recipientsOf(data);

  // 2xx on events we don't handle and on payloads with no recipient —
  // returning an error would make Svix retry a message that will never
  // succeed, and eventually disable the endpoint for the events we DO care
  // about.
  if (emails.length === 0) return NextResponse.json({ ok: true, ignored: 'no recipient' });

  let column: 'email_bounced_at' | 'email_complained_at';
  if (type === 'email.bounced') {
    if (!isPermanentBounce((data as { bounce?: unknown }).bounce)) {
      // Soft bounce: mailbox full, greylisted, MX briefly down. These
      // recover on their own — flagging them would strand a paying user.
      logInfo({ event: 'resend.webhook.transient_bounce', count: emails.length });
      return NextResponse.json({ ok: true, ignored: 'transient bounce' });
    }
    column = 'email_bounced_at';
  } else if (type === 'email.complained') {
    column = 'email_complained_at';
  } else {
    return NextResponse.json({ ok: true, ignored: type || 'unknown' });
  }

  // Service-role: the v9 lockdown leaves these columns unwritable by the
  // `authenticated` role, which is exactly right — a user must not be able
  // to clear their own complaint flag and put themselves back on the list.
  const admin = createAdminSupabaseClient();
  const stamp = new Date().toISOString();

  try {
    // Look the profiles up first so a complaint can merge into the existing
    // email_prefs rather than clobbering keys we didn't mean to touch.
    const { data: profiles, error: readErr } = await admin
      .from('profiles')
      .select('id, email, email_prefs')
      .in('email', emails);
    if (readErr) throw new Error(readErr.message);

    if (!profiles || profiles.length === 0) {
      // Perfectly normal: contact-form senders and the admin 2FA address
      // have no profile row. Nothing to record, but the event was handled.
      logInfo({ event: 'resend.webhook.no_profile', type, count: emails.length });
      return NextResponse.json({ ok: true, matched: 0 });
    }

    for (const profile of profiles) {
      const patch: Record<string, unknown> = { [column]: stamp };

      if (column === 'email_complained_at') {
        // A complaint is the loudest opt-out signal there is. Honour it
        // across every non-transactional topic at once — asking them to
        // find the unsubscribe link now is how the next complaint happens.
        const prefs = { ...((profile.email_prefs as Record<string, boolean>) ?? {}) };
        for (const key of OPT_OUT_ON_COMPLAINT) prefs[key] = false;
        patch.email_prefs = prefs;
      }

      const { error: updErr } = await admin
        .from('profiles')
        .update(patch)
        .eq('id', profile.id);
      if (updErr) {
        logError({ event: 'resend.webhook.update_failed', user_id: profile.id, error: updErr.message });
      }
    }

    logInfo({ event: 'resend.webhook.recorded', type, matched: profiles.length });
    return NextResponse.json({ ok: true, matched: profiles.length });
  } catch (err: any) {
    logError({ event: 'resend.webhook.unhandled', type, error: err?.message ?? String(err) });
    // 500 so Svix retries — a transient database blip shouldn't lose a
    // complaint, which is the one event we must never drop.
    return NextResponse.json({ error: 'Failed to record event' }, { status: 500 });
  }
}
