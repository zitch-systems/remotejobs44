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
import { createHmac, timingSafeEqual } from 'crypto';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send';
import { paymentFailedEmail } from '@/lib/email/templates';
import { fetchActiveSubscriptionForCustomer } from '@/lib/paystack/subscription';
import {
  isValidPlan, chargeMatchesPlan, getPlanTier as planTierShared,
  getBilling as billingShared, getPlanExpiry as planExpiryShared,
} from '@/lib/paystack/plans';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const ADMIN_NOTIFY    = process.env.CONTACT_EMAIL ?? 'hello@remotejobs44.com';

// Build the dedup key for a Paystack event. Each event type carries its
// canonical resource id in a different field — we pick the most
// specific available so e.g. a `charge.success` retry with the same
// `reference` short-circuits even if `data.id` rotated.
function extractPaystackId(event: any): string | null {
  const d = event?.data ?? {};
  const candidates = [
    d.reference,                          // charge.success
    d.invoice_code,                       // invoice.create / invoice.update
    d.subscription?.subscription_code,    // invoice.payment_failed (nested)
    d.subscription_code,                  // subscription.disable / expiring_cards
    d.id != null ? String(d.id) : null,   // generic numeric id fallback
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return null;
}

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
  }).catch(err => console.error('[webhook orphan-charge email]', err));
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
    console.error('[webhook] PAYSTACK_SECRET_KEY not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const hash = createHmac('sha512', PAYSTACK_SECRET).update(body).digest('hex');
  // Use constant-time comparison to prevent timing-attack signature leak.
  // Both sides are hex strings of identical length (128 chars for SHA-512);
  // bail before timingSafeEqual otherwise (which throws on length mismatch).
  if (!signature || signature.length !== hash.length ||
      !timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(signature, 'hex'))) {
    console.warn('[webhook] Invalid signature');
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
        console.log(`[webhook] dedup hit: ${event.event} ${paystackId}`);
        return NextResponse.json({ received: true, deduplicated: true });
      }
      // Any other insert error → log and proceed (don't block the
      // event just because the audit log failed).
      console.error('[webhook] dedup log insert failed:', dedupError.message);
    }
  }

  switch (event.event) {
    case 'charge.success': {
      const { metadata, reference, amount, currency, customer } = event.data ?? {};
      const userId = metadata?.user_id;
      const plan   = metadata?.plan;

      if (!userId || !plan) break;
      if (!isValidPlan(plan)) {
        console.warn('[webhook] invalid plan: ' + plan);
        notifyOrphanCharge(reference ?? 'unknown', userId, plan ?? 'unknown', amount ?? 0);
        break;
      }
      // Stop the "metadata says pro_annual, charge was ₦500" tampering
      // attack: if the verified amount doesn't match what we expect for
      // the plan, refuse to credit anything.
      if (!chargeMatchesPlan(plan, amount, currency)) {
        console.warn(`[webhook] amount mismatch — plan=${plan} got=${amount}${currency}`);
        notifyOrphanCharge(reference ?? 'unknown', userId, plan, amount ?? 0);
        break;
      }
      if (!(await validateUserId(supabase, userId))) {
        // Money was charged but the user no longer exists. Fire an alert
        // email so ops can refund or hand-fix instead of silently dropping
        // the payment.
        console.warn('[webhook] orphan charge — user not found: ' + userId);
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
          console.log('[webhook] charge.success: skipped duplicate reference ' + reference);
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
          console.error('[webhook] profile update failed for ' + userId + ':', updateError.message);
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
      if (subError) console.error('[webhook] subscription upsert failed:', subError.message);

      console.log('[webhook] charge.success: ' + userId + ' upgraded to ' + tier + ' (ref ' + reference + ')');
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

      console.log('[webhook] subscription.disable: ' + userId + ' marked cancelled (plan stays until current_period_end)');
      break;
    }

    // PAYSTACK FIRES THIS AS A WARNING — DO NOT DOWNGRADE.
    // The user's card is approaching its expiry date; we just log so the team
    // can email them a reminder via a separate job. The subscription is still
    // active until subscription.disable fires (if at all).
    case 'subscription.expiring_cards': {
      const userId = event.data?.metadata?.user_id;
      console.log('[webhook] subscription.expiring_cards (warning, no plan change): ' + (userId ?? 'unknown'));
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
        console.warn('[webhook] invoice.payment_failed without resolvable user');
        break;
      }

      // Admins are exempt — skip downgrade flow entirely.
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, email, role, plan')
        .eq('id', userId)
        .maybeSingle();
      if (profile?.role === 'admin') {
        console.log('[webhook] invoice.payment_failed: admin user, ignoring');
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
          console.error('[webhook] payment-failed email send failed:', err)
        );
      }

      console.log('[webhook] invoice.payment_failed: ' + userId + ' marked payment_failed, period_end set to now');
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
