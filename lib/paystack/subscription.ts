// lib/paystack/subscription.ts
// Helper for looking up a customer's active subscription on Paystack and
// pulling the email_token from it. The token is needed for the official
// /subscription/disable call when a user later cancels.
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? '';

export interface PaystackSubInfo {
  subscription_code: string;
  email_token:       string;
  plan_code?:        string | null;
  status?:           string | null;
}

// Returns the latest active subscription for the given customer code, or null
// if none / the API call fails. Best-effort — callers should treat missing
// data as "fine, fall back to soft cancel".
export async function fetchActiveSubscriptionForCustomer(
  customerCode: string | null | undefined
): Promise<PaystackSubInfo | null> {
  if (!PAYSTACK_SECRET || !customerCode) return null;
  try {
    const res = await fetch(
      `https://api.paystack.co/subscription?customer=${encodeURIComponent(customerCode)}&perPage=10`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const items: any[] = json?.data ?? [];
    if (items.length === 0) return null;
    // Prefer 'active'; fall back to the most recently created row.
    const active = items.find(s => s.status === 'active') ?? items[0];
    if (!active?.subscription_code || !active?.email_token) return null;
    return {
      subscription_code: active.subscription_code,
      email_token:       active.email_token,
      plan_code:         active.plan?.plan_code ?? null,
      status:            active.status ?? null,
    };
  } catch (err) {
    console.error('[paystack] fetchActiveSubscriptionForCustomer failed:', err);
    return null;
  }
}
