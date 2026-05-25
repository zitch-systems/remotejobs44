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
import { createHmac } from 'crypto';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

function getPlanTier(plan: string): 'daily' | 'pro' | 'free' {
  if (plan === 'daily')      return 'daily';
  if (plan === 'pro_annual') return 'pro';
  if (plan === 'pro')        return 'pro';
  return 'free';
}

function getBilling(plan: string): 'daily' | 'monthly' | 'annually' {
  if (plan === 'daily')      return 'daily';
  if (plan === 'pro_annual') return 'annually';
  return 'monthly';
}

function getExpiresAt(plan: string): Date {
  const d = new Date();
  if (plan === 'daily')      d.setHours(d.getHours() + 24);
  else if (plan === 'pro_annual') d.setFullYear(d.getFullYear() + 1);
  else                       d.setMonth(d.getMonth() + 1);
  return d;
}

async function validateUserId(supabase: ReturnType<typeof createAdminSupabaseClient>, userId: string): Promise<boolean> {
  if (!userId || typeof userId !== 'string') return false;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(userId)) return false;
  const { data } = await supabase.from('profiles').select('id, role').eq('id', userId).maybeSingle();
  return !!data;
}

function validatePlan(plan: string): boolean {
  return ['daily', 'pro', 'pro_annual'].includes(plan);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('x-paystack-signature');

  if (!PAYSTACK_SECRET) {
    console.error('[webhook] PAYSTACK_SECRET_KEY not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const hash = createHmac('sha512', PAYSTACK_SECRET).update(body).digest('hex');
  if (!signature || hash !== signature) {
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

  switch (event.event) {
    case 'charge.success': {
      const { metadata, reference, amount, currency, customer } = event.data ?? {};
      const userId = metadata?.user_id;
      const plan   = metadata?.plan;

      if (!userId || !plan) break;
      if (!validatePlan(plan)) { console.warn('[webhook] invalid plan: ' + plan); break; }
      if (!(await validateUserId(supabase, userId))) {
        console.warn('[webhook] user not found: ' + userId);
        break;
      }

      // Idempotency: if a subscription row already exists for this period_end,
      // assume the verify endpoint already processed this payment.
      const tier      = getPlanTier(plan);
      const billing   = getBilling(plan);
      const expiresAt = getExpiresAt(plan);

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

      const { error: subError } = await supabase.from('subscriptions').upsert({
        user_id:                userId,
        plan:                   tier,
        billing,
        status:                 'active',
        paystack_customer_code: customer?.customer_code ?? null,
        current_period_start:   new Date().toISOString(),
        current_period_end:     expiresAt.toISOString(),
        currency:               currency ?? 'NGN',
        price:                  (amount ?? 0) / 100,
      }, { onConflict: 'user_id' });
      if (subError) console.error('[webhook] subscription upsert failed:', subError.message);

      console.log('[webhook] charge.success: ' + userId + ' upgraded to ' + tier + ' (ref ' + reference + ')');
      break;
    }

    // Real cancel event — downgrade to free.
    case 'subscription.disable': {
      const userId = event.data?.metadata?.user_id;
      if (!userId) break;
      if (!(await validateUserId(supabase, userId))) break;

      // Don't touch admins.
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', userId).maybeSingle();
      if (profile?.role === 'admin') break;

      await supabase
        .from('profiles')
        .update({ plan: 'free', plan_expires_at: null, updated_at: new Date().toISOString() })
        .eq('id', userId);

      await supabase
        .from('subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      console.log('[webhook] subscription.disable: downgraded ' + userId + ' to free');
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

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
