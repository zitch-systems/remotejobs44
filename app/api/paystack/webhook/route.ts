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
import { extractPaystackId } from '@/lib/paystack/event-id';
import { verifyPaystackSignature } from '@/lib/paystack/verify-signature';
import { logInfo, logWarn, logError } from '@/lib/log';
import {
  isValidPlan, chargeMatchesPlan, getPlanTier as planTierShared,
  getBilling as billingShared, getPlanExpiry as planExpiryShared,
} from '@/lib/paystack/plans';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const ADMIN_NOTIFY    = process.env.CONTACT_EMAIL ?? 'hello@remotejobs44.com';

// extractPaystackId lives in lib/paystack/event-id.ts so it can be
// unit-tested independently of the webhook route handler.

// Fire-and-forget: tell ops a paid charge landed for a user that no longer
// exists in the profiles table. Without this, the user is silently never
// upgraded after paying — they'd have to email support before anyone noticed.
function notifyOrphanCharge(reference: string, userId: string, plan: string, amountKobo: number) {
  const naira = (amountKobo / 100).toLocaleString();
  sendEmail({
    to: ADMIN_NOTIFY,
    subject: `[RemoteJobs44] Orphan Paystack charge — refund or fix profile`,
    html: `<p>A successful Paystack <strong>charge.success</strong> event arrived for a user_id that does not exist in <code>public.profiles</code>.</p>
      <ul>
        <li><strong>Reference:</strong> ${reference}</li>
        <li><strong>Missing user_id:</strong> ${userId}</li>
        <li><strong>Plan:</strong> ${plan}</li>
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
  const { data } = await supabase.from('profiles').select('id, role').eq('id', userId).maybeSingle();
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

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  // Generic idempotency: short-circuit any event we've already
  // processed. Keyed on (event_type, paystack_id) where paystack_id is
  // the most specific identifier in the payload. The unique index on
  // paystack_webhook_events raises a 23505 (unique_violation) on insert
  // for a duplicate; we catch that and return 200 OK silently so
  // Paystack stops retrying.
  const paystackId = extractPaystackId(event);
  if (paystackId) {
    const { error: dedupError } = await supabase
      .from('paystack_webhook_events')
      .insert({
        event_type:  event.event ?? 'unknown',
        paystack_id: paystackId,
        payload:     event.data ?? null,
      });
    if (dedupError) {
      // 23505 = unique_violation. Treat as "already processed".
      if (dedupError.code === '23505') {
        logInfo({ event: 'webhook.dedup_hit', event_type: event.event, paystack_id: paystackId });
        return NextResponse.json({ received: true, deduplicated: true });
      }
      // Any other insert error → log and proceed (don't block the
      // event just because the audit log failed).
      logError({ event: 'webhook.dedup_log_insert_failed', error: dedupError.message, event_type: event.event, paystack_id: paystackId });
    }
  }

  switch (event.event) {
    case 'charge.success': {
      const { metadata, reference, amount, currency, customer } = event.data ?? {};
      const userId = metadata?.user_id;
      const plan   = metadata?.plan;

      if (!userId || !plan) break;
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

      // Idempotency: if this paystack_reference is already on a sub row,
      // verify endpoint already credited this charge. No-op.
      if (reference) {
        const { data: refRow } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('paystack_reference', reference)
          .maybeSingle();
        if (refRow) {
          logInfo({ event: 'webhook.charge_success.duplicate', reference, user_id: userId });
          break;
        }
      }

      const tier      = planTierShared(plan);
      const billing   = billingShared(plan);
      const expiresAt = planExpiryShared(plan);

      // Skip plan write if user is an admin — admins get a permanent 'admin' plan tag.
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', userId).maybeSingle();
      const isAdmin = profile?.role === 'admin';

      if (!isAdmin) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            plan:            tier,
            plan_expires_at: expiresAt.toISOString(),
            updated_at:      new Date().toISOString(),
          })
          .eq('id', userId);
        if (updateError) {
          logError({ event: 'webhook.profile_update_failed', user_id: userId, error: updateError.message });
        }
      }

      // Persist Paystack's subscription_code + email_token so user-initiated
      // cancellation can call /subscription/disable directly. Day Pass is
      // a one-off — no subscription is created — so skip the lookup.
      const paystackSub = plan === 'daily'
        ? null
        : await fetchActiveSubscriptionForCustomer(customer?.customer_code);

      const { error: subError } = await supabase.from('subscriptions').upsert({
        user_id:                    userId,
        plan:                       tier,
        billing,
        status:                     'active',
        paystack_reference:         reference ?? null,
        paystack_customer_code:     customer?.customer_code ?? null,
        paystack_subscription_code: paystackSub?.subscription_code ?? null,
        paystack_email_token:       paystackSub?.email_token ?? null,
        current_period_start:       new Date().toISOString(),
        current_period_end:         expiresAt.toISOString(),
        currency:                   currency ?? 'NGN',
        price:                      (amount ?? 0) / 100,
      }, { onConflict: 'user_id' });
      if (subError) logError({ event: 'webhook.subscription_upsert_failed', user_id: userId, error: subError.message });

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
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', userId).maybeSingle();
      if (profile?.role === 'admin') break;

      await supabase
        .from('subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('user_id', userId);

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
        const { data } = await supabase
          .from('subscriptions')
          .select('user_id, plan')
          .eq('paystack_subscription_code', subCode)
          .maybeSingle();
        userId = data?.user_id ?? null;
      }
      if (!userId) userId = subData.metadata?.user_id ?? null;
      if (!userId) {
        logWarn({ event: 'webhook.payment_failed.unresolvable_user', subscription_code: subCode });
        break;
      }

      // Admins are exempt — skip downgrade flow entirely.
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, email, role, plan')
        .eq('id', userId)
        .maybeSingle();
      if (profile?.role === 'admin') {
        logInfo({ event: 'webhook.payment_failed.admin_skip', user_id: userId });
        break;
      }

      const nowIso = new Date().toISOString();
      await supabase
        .from('subscriptions')
        .update({
          status:               'payment_failed',
          current_period_end:   nowIso,
          updated_at:           nowIso,
        })
        .eq('user_id', userId);

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

  return NextResponse.json({ received: true });
}
