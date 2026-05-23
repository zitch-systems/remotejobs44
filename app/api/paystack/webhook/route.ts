// app/api/paystack/webhook/route.ts
// Paystack webhook — receives subscription lifecycle events
// Set webhook URL in: Paystack Dashboard -> Settings -> API Keys & Webhooks
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

function getPlanTier(plan: string): string {
  if (plan === 'daily')      return 'daily';
  if (plan === 'pro_annual') return 'pro';
  if (plan === 'pro')        return 'pro';
  return 'free';
}

async function validateUserId(supabase: ReturnType<typeof createAdminSupabaseClient>, userId: string): Promise<boolean> {
  if (!userId || typeof userId !== 'string') return false;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(userId)) return false;
  const { data } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
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
      const { metadata, reference } = event.data;
      const userId = metadata?.user_id;
      const plan   = metadata?.plan;

      if (!userId || !plan) break;
      if (!validatePlan(plan)) {
        console.warn('[webhook] invalid plan: ' + plan);
        break;
      }
      if (!(await validateUserId(supabase, userId))) {
        console.warn('[webhook] user not found: ' + userId);
        break;
      }

      const { data: existingTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('reference', reference)
        .maybeSingle();

      if (existingTx) {
        console.warn('[webhook] duplicate reference: ' + reference);
        break;
      }

      await supabase.from('transactions').insert({
        reference,
        user_id: userId,
        plan,
        amount: event.data.amount,
        currency: event.data.currency ?? 'NGN',
        status: 'success',
        processed_at: new Date().toISOString(),
      });

      const tier = getPlanTier(plan);
      const expiresAt = plan === 'daily'
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : plan === 'pro_annual'
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ plan: tier, plan_expires_at: expiresAt, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (updateError) {
        console.error('[webhook] update failed for ' + userId + ':', updateError);
      } else {
        console.log('[webhook] upgraded ' + userId + ' to ' + tier);
      }
      break;
    }

    case 'subscription.disable':
    case 'subscription.expiring_cards': {
      const { metadata } = event.data;
      const userId = metadata?.user_id;
      if (!userId) break;
      if (!(await validateUserId(supabase, userId))) break;

      await supabase
        .from('profiles')
        .update({ plan: 'free', plan_expires_at: null, updated_at: new Date().toISOString() })
        .eq('id', userId);

      console.log('[webhook] ' + event.event + ': downgraded ' + userId + ' to free');
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
