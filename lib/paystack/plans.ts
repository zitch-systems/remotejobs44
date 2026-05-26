// lib/paystack/plans.ts — single source of truth for plan amounts/tiers.
// Used by initialize (to set the Paystack charge amount), verify (to
// validate the verified charge matches the expected amount for the plan
// in metadata), and the webhook (same validation).

// Amounts in KOBO (1 Naira = 100 kobo). Match what's configured on
// Paystack Dashboard → Subscriptions → Plans.
export const PLAN_AMOUNTS_KOBO: Record<string, number> = {
  daily:      50000,    // ₦500
  pro:        299900,   // ₦2,999
  pro_annual: 2999900,  // ₦29,999
};

export type PaymentPlan = 'daily' | 'pro' | 'pro_annual';

export function isValidPlan(plan: unknown): plan is PaymentPlan {
  return typeof plan === 'string' && Object.prototype.hasOwnProperty.call(PLAN_AMOUNTS_KOBO, plan);
}

export function getPlanTier(plan: string): 'daily' | 'pro' | 'free' {
  if (plan === 'daily')      return 'daily';
  if (plan === 'pro')        return 'pro';
  if (plan === 'pro_annual') return 'pro';
  return 'free';
}

export function getBilling(plan: string): 'daily' | 'monthly' | 'annually' {
  if (plan === 'daily')      return 'daily';
  if (plan === 'pro_annual') return 'annually';
  return 'monthly';
}

export function getPlanExpiry(plan: string, from: Date = new Date()): Date {
  const d = new Date(from);
  if (plan === 'daily') {
    d.setHours(d.getHours() + 24);
    return d;
  }
  if (plan === 'pro_annual') {
    // Day-clamp for year too — Feb 29 in a leap year → Feb 28 next year.
    const day = d.getDate();
    d.setDate(1);
    d.setFullYear(d.getFullYear() + 1);
    d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
    return d;
  }
  // Monthly. setMonth(+1) on Jan 31 rolls to Mar 3 because Feb has no 31st.
  // Clamp the day to the last valid day of the target month so users who
  // pay on the 31st don't get an "extra" 2–3 days at month boundaries
  // (and conversely, don't *lose* days at others — Aug 31 → Sep 30 is fair).
  const day = d.getDate();
  d.setDate(1);                            // park on day-1 to avoid rollover
  d.setMonth(d.getMonth() + 1);            // safe — every month has a day 1
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return d;
}

function daysInMonth(year: number, month: number): number {
  // month is 0-indexed. Day 0 of next month == last day of this month.
  return new Date(year, month + 1, 0).getDate();
}

// Validates that the verified Paystack charge matches what we expect for
// the metadata plan. Both checks together stop the "pay daily, claim
// pro_annual" tampering attack.
export function chargeMatchesPlan(
  plan: string,
  amountKobo: number | null | undefined,
  currency: string | null | undefined,
): boolean {
  if (!isValidPlan(plan)) return false;
  if (currency !== 'NGN') return false;
  const expected = PLAN_AMOUNTS_KOBO[plan];
  // Allow 1 naira (100 kobo) tolerance for rounding / fee accommodations.
  return Math.abs((amountKobo ?? 0) - expected) <= 100;
}
