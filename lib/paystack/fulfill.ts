import type { createAdminSupabaseClient } from '@/lib/supabase/server';
import { chargeMatchesPlan, isValidPlan, type PaymentPlan } from './plans';

/** Web checkout uses plan; the mobile checkout uses selection: annual. */
export function paymentPlanFromMetadata(metadata: any): PaymentPlan | null {
  const selection = metadata?.selection;
  if (selection === 'annual') return 'pro_annual';
  if (isValidPlan(selection)) return selection;
  return isValidPlan(metadata?.plan) ? metadata.plan : null;
}

export async function fulfillPaystackCharge(
  db: ReturnType<typeof createAdminSupabaseClient>,
  charge: { reference: string; userId: string; plan: PaymentPlan; amount: number; currency: string;
    customerCode?: string | null; subscriptionCode?: string | null; emailToken?: string | null },
): Promise<{ credited: boolean; plan: string; expires_at: string | null }> {
  if (!chargeMatchesPlan(charge.plan, charge.amount, charge.currency)) throw new Error('Payment amount mismatch');
  const { data, error } = await db.rpc('fulfill_paystack_charge', {
    p_reference: charge.reference, p_user_id: charge.userId, p_selection: charge.plan,
    p_amount: charge.amount, p_currency: charge.currency,
    p_customer_code: charge.customerCode ?? null,
    p_subscription_code: charge.subscriptionCode ?? null,
    p_email_token: charge.emailToken ?? null,
  });
  // Never fall back to independent writes: that recreates the partial-credit bug.
  if (error) throw new Error(`Payment fulfillment failed: ${error.message}`);
  if (!data || typeof data.credited !== 'boolean') throw new Error('Invalid payment fulfillment result');
  return data;
}
