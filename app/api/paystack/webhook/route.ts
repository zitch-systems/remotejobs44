// app/api/paystack/webhook/route.ts
// Paystack webhook — receives subscription lifecycle events.
// Set webhook URL in: Paystack Dashboard -> Settings -> API Keys & Webhooks.
//
// Critical correctness rules:
//   - `subscription.expiring_cards` is a WARNING (Paystack notifies that a card
//     will expire) — it does NOT mean the subscription is cancelled. We must
//     NOT downgrade the user on this event.
//   - The actual cancel event is `subscription.disable`.
//   - We use the `subscriptions` table itself for idempotency, not a separate
//     `transactions` table (which doesn't exist in the schema).
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send';
import { paymentFailedEmail } from '@/lib/email/templates';
import { fetchActiveSubscriptionForCustomer } from '@/lib/paystack/subscription';
import { recordReferralCommission } from '@/lib/referral/commission';
import { fulfillPaystackCharge, paymentPlanFromMetadata } from '@/lib/paystack/fulfill';
import { extractPaystackId } from '@/lib/paystack/event-id';
import { verifyPaystackSignature } from '@/lib/paystack/verify-signature';
import { paystackWebhookEnvelopeSchema } from '@/lib/api-schemas';
import { logInfo, logWarn, logError } from '@/lib/log';
import {
  isValidPlan, chargeMatchesPlan, getPlanTier as planTierShared,
  getBilling as billingShared,
} from '@/lib/paystack/plans';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const ADMIN_NOTIFY    = process.env.CONTACT_EMAIL ?? 'hello@remotejobs44.com';

// extractPaystackId lives in lib/paystack/event-id.ts so it can be
// unit-tested independently of the webhook route handler.

// Fire-and-forget: tell ops a paid charge landed for a user that no longer
// exists in the profiles table. Without this, the user is silently never
// upgraded after paying — they'd have to email support before anyone noticed.
//
// HTML-escape every dynamic value before splicing — the signature check
// guarantees the event came from Paystack, not that the metadata payload
// is safe HTML. metadata.plan and metadata.user_id are echoed from what
// the client sent at /api/paystack/initialize, so they're user-influenced
// at one remove.
function notifyOrphanChargeEscape(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function notifyOrphanCharge(reference: string, userId: string, plan: string, amountKobo: number) {
  const naira = (amountKobo / 100).toLocaleString();
  const refHtml  = notifyOrphanChargeEscape(reference);
  const userHtml = notifyOrphanChargeEscape(userId);
  const planHtml = notifyOrphanChargeEscape(plan);
  sendEmail({
    to: ADMIN_NOTIFY,
    subject: `[RemoteJobs44] Orphan Paystack charge — refund or fix profile`,
    html: `<p>A successful Paystack <strong>charge.success</strong> event arrived for a user_id that does not exist in <code>public.profiles</code>.</p>
      <ul>
        <li><strong>Reference:</strong> ${refHtml}</li>
        <li><strong>Missing user_id:</strong> ${userHtml}</li>
        <li><strong>Plan:</strong> ${planHtml}</li>
        <li><strong>Amount:</strong> ₦${naira}</li>
      </ul>
      <p>Action: either refund the customer in the Paystack dashboard, or (if the user just deleted their account and re-signed up) manually upgrade the new profile and re-link the subscription row.</p>`,
  }).catch(err => logError({ event: 'webhook.orphan_charge_email_failed', error: err?.message ?? String(err), reference }));
}

// Plan helpers (getPlanTier, getBilling, getExpiresAt, isValidPlan) moved
// to lib/paystack/plans.ts so initialize, verify, and webhook all agree.

async function validateUserId(supabase: ReturnType<typeof createAdminSupabaseClient>, userId: string): Promise<boolean> {
  if (!userId || typeof userId !== 'string') return false;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(userId)) return false;
  const { data, error } = await supabase.from('profiles').select('id, role').eq('id', userId).maybeSingle();
  if (error) throw new Error(`Account lookup failed: ${error.message}`);
  return !!data;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('x-paystack-signature');

  if (!PAYSTACK_SECRET) {
    logError({ event: 'webhook.misconfigured', detail: 'PAYSTACK_SECRET_KEY missing' });
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  // verifyPaystackSignature does the HMAC + constant-time compare + safe
  // handling of length-mismatch / non-hex probes. See its unit test for
  // the attacker-probe matrix this guards against.
  const sigCheck = verifyPaystackSignature(body, signature, PAYSTACK_SECRET);
  if (!sigCheck.ok) {
    logWarn({ event: 'webhook.invalid_signature', reason: sigCheck.reason });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Envelope check (signature is already verified above). Asserts only the
  // top-level shape — a non-empty `event` string — so the switch can trust it.
  // `data` is left permissive on purpose: each branch reads its own fields
  // defensively, so a new Paystack event type is never rejected here.
  const envelope = paystackWebhookEnvelopeSchema.safeParse(parsedBody);
  if (!envelope.success) {
    logWarn({ event: 'webhook.invalid_envelope' });
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const event = envelope.data as any;

  const supabase = createAdminSupabaseClient();

  const paystackId = extractPaystackId(event);
  try {
    if (paystackId) {
      const { error: dedupError } = await supabase.from('paystack_webhook_events').insert({
        event_type: event.event, paystack_id: paystackId,
        payload: event.data ?? null, processed: false,
      });
      if (dedupError?.code === '23505') {
        const { data: prior, error } = await supabase.from('paystack_webhook_events')
          .select('processed').eq('event_type', event.event).eq('paystack_id', paystackId).maybeSingle();
        if (error || !prior) throw new Error('Unable to verify previous webhook processing');
        // Charges always go through the atomic per-reference RPC. Merely receiving
        // a webhook (including one logged by the old handler) never proves credit.
        if (prior.processed && event.event !== 'charge.success') {
          return NextResponse.json({ received: true, deduplicated: true });
        }
      } else if (dedupError) {
        throw new Error(`Unable to record webhook: ${dedupError.message}`);
      }
    }

  switch (event.event) {
    case 'charge.success': {
      const { metadata, reference, amount, currency, customer } = event.data ?? {};
      const userId = metadata?.user_id;
      const plan   = paymentPlanFromMetadata(metadata);

      if (!userId || !plan) break;
      if (typeof reference !== 'string' || !reference) throw new Error('Charge reference missing');
      if (!isValidPlan(plan)) {
        logWarn({ event: 'webhook.invalid_plan', plan, user_id: userId });
        notifyOrphanCharge(reference ?? 'unknown', userId, plan ?? 'unknown', amount ?? 0);
        break;
      }
      // Stop the "metadata says pro_annual, charge was ₦500" tampering
      // attack: if the verified amount doesn't match what we expect for
      // the plan, refuse to credit anything.
      if (!chargeMatchesPlan(plan, amount, currency)) {
        logWarn({ event: 'webhook.amount_mismatch', plan, amount, currency, user_id: userId });
        notifyOrphanCharge(reference ?? 'unknown', userId, plan, amount ?? 0);
        break;
      }
      if (!(await validateUserId(supabase, userId))) {
        // Money was charged but the user no longer exists. Fire an alert
        // email so ops can refund or hand-fix instead of silently dropping
        // the payment.
        logWarn({ event: 'webhook.orphan_charge', user_id: userId, plan, amount });
        notifyOrphanCharge(reference ?? 'unknown', userId, plan, amount ?? 0);
        break;
      }

      const tier      = planTierShared(plan);
      const billing   = billingShared(plan);

      const paystackSub = plan === 'daily'
        ? null
        : await fetchActiveSubscriptionForCustomer(customer?.customer_code);
      const fulfillment = await fulfillPaystackCharge(supabase, {
        reference, userId, plan, amount, currency,
        customerCode: customer?.customer_code,
        subscriptionCode: paystackSub?.subscription_code,
        emailToken: paystackSub?.email_token,
      });
      if (!fulfillment.credited) break;

      // Referral commission — mirror of the verify route. Idempotent on
      // reference, so whichever of verify/webhook lands second is a no-op,
      // and internally guarded so it can't break the charge crediting.
      await recordReferralCommission(supabase, {
        referredUserId: userId,
        plan:           tier,
        billing,
        amount:         (amount ?? 0) / 100,
        currency:       currency ?? 'NGN',
        reference:      reference ?? null,
      });

      logInfo({ event: 'webhook.charge_success', user_id: userId, tier, reference });
      break;
    }

    // Cancel signal — soft-cancel only. DO NOT downgrade plan / clear
    // plan_expires_at here. The user paid for time they haven't used yet
    // (e.g., bought an annual plan on day 1, cancelled day 2 — they still
    // get 363 more days of access). The expire-daily cron is the only
    // thing that downgrades, when plan_expires_at falls into the past.
    case 'subscription.disable': {
      const userId = event.data?.metadata?.user_id;
      if (!userId) break;
      if (!(await validateUserId(supabase, userId))) break;

      // Don't touch admins.
      const { data: profile, error: profileError } = await supabase
        .from('profiles').select('role').eq('id', userId).maybeSingle();
      if (profileError) throw new Error(profileError.message);
      if (profile?.role === 'admin') break;

      const { error: cancelError } = await supabase
        .from('subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      if (cancelError) throw new Error(cancelError.message);
      logInfo({ event: 'webhook.subscription_disable', user_id: userId });
      break;
    }

    // PAYSTACK FIRES THIS AS A WARNING — DO NOT DOWNGRADE.
    // The user's card is approaching its expiry date; we just log so the team
    // can email them a reminder via a separate job. The subscription is still
    // active until subscription.disable fires (if at all).
    case 'subscription.expiring_cards': {
      const userId = event.data?.metadata?.user_id;
      logInfo({ event: 'webhook.expiring_cards', user_id: userId ?? null });
      break;
    }

    // Paystack failed to charge the saved card for the next billing cycle.
    // It will retry automatically for a few days. We:
    //   1. Mark the subscription status as 'payment_failed' so the apply
    //      gate and the next cron run can react.
    //   2. Shorten current_period_end to now — the user has already
    //      consumed the period they paid for; without this, the previous
    //      grace window let them keep Pro access for ~12 free days/year
    //      across the billing cycles where Paystack silently couldn't
    //      collect (the audit's headline revenue leak).
    //   3. Email the user a clear "update your card" CTA so they can
    //      recover before the next cron downgrade.
    // The /cron/daily expire pass picks up status='cancelled' OR 'active'
    // with past current_period_end — payment_failed inherits the same
    // sweep, so no cron change needed.
    case 'invoice.payment_failed': {
      const subData  = event.data ?? {};
      const customer = subData.customer ?? {};
      const subCode  = subData.subscription?.subscription_code
                    ?? subData.subscription_code
                    ?? null;

      // Locate the user — prefer subscription_code (canonical), fall back to
      // metadata.user_id (less reliable; Paystack doesn't always echo it).
      let userId: string | null = null;
      if (subCode) {
        const { data, error: lookupError } = await supabase
          .from('subscriptions')
          .select('user_id, plan')
          .eq('paystack_subscription_code', subCode)
          .maybeSingle();
        if (lookupError) throw new Error(lookupError.message);
        userId = data?.user_id ?? null;
      }
      if (!userId) userId = subData.metadata?.user_id ?? null;
      if (!userId) {
        logWarn({ event: 'webhook.payment_failed.unresolvable_user', subscription_code: subCode });
        break;
      }

      // Admins are exempt — skip downgrade flow entirely.
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('name, email, role, plan')
        .eq('id', userId)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);
      if (profile?.role === 'admin') {
        logInfo({ event: 'webhook.payment_failed.admin_skip', user_id: userId });
        break;
      }

      const nowIso = new Date().toISOString();
      const { error: failedPaymentError } = await supabase
        .from('subscriptions')
        .update({
          status:               'payment_failed',
          current_period_end:   nowIso,
          updated_at:           nowIso,
        })
        .eq('user_id', userId);

      if (failedPaymentError) throw new Error(failedPaymentError.message);

      // Email the user — fire-and-forget. The .catch keeps the webhook
      // 200 OK even if Resend is briefly down.
      if (profile?.email) {
        const planLabel = profile.plan === 'pro' ? 'Pro' : profile.plan === 'daily' ? 'Day Pass' : 'subscription';
        const { subject, html } = paymentFailedEmail(profile.name ?? 'there', planLabel);
        sendEmail({ to: profile.email, subject, html }).catch(err =>
          logError({ event: 'webhook.payment_failed.email_send_failed', error: err?.message ?? String(err), user_id: userId })
        );
      }

      logInfo({ event: 'webhook.payment_failed', user_id: userId });
      break;
    }

    default:
      break;
  }

    if (paystackId) {
      const { error } = await supabase.from('paystack_webhook_events')
        .update({ processed: true }).eq('event_type', event.event).eq('paystack_id', paystackId);
      if (error) throw new Error(`Unable to finish webhook audit: ${error.message}`);
    }
    return NextResponse.json({ received: true });
  } catch (error: any) {
    logError({ event: 'webhook.processing_failed', error: error?.message ?? String(error), event_type: event.event });
    // Paystack retries non-2xx responses; the atomic charge RPC makes retries safe.
    return NextResponse.json({ error: 'Payment processing temporarily unavailable' }, { status: 503 });
  }
}
