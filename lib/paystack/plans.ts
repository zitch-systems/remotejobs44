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

// Plan "rank" — higher means more access. Pro monthly and annual both map
// to the 'pro' tier in profiles, so billing distinguishes them:
//   free 0 · daily 1 · pro-monthly 2 · pro-annual 3
function currentRank(tier: 'free' | 'daily' | 'pro' | 'admin', billing?: string | null): number {
  if (tier === 'pro')   return billing === 'annually' ? 3 : 2;
  if (tier === 'daily') return 1;
  return 0; // 'free' (admin is handled before this is called)
}

function requestedRank(plan: PaymentPlan): number {
  if (plan === 'pro_annual') return 3;
  if (plan === 'pro')        return 2;
  return 1; // daily
}

// Upgrade-only purchase rule. Given the user's *current effective plan*
// (tier from resolvePlan, billing from their subscriptions row) and the
// plan they want to buy, allow it only when it's a strict upgrade. This
// stops a user re-paying for the plan they already hold and blocks
// downgrades, while letting them move up — Day Pass → Pro, monthly →
// annual, etc. free / expired (resolvePlan → 'free') and admin always pass.
export function canPurchase(
  current: { tier: 'free' | 'daily' | 'pro' | 'admin'; billing?: string | null },
  requested: PaymentPlan,
): { ok: true } | { ok: false; reason: string } {
  if (current.tier === 'admin') return { ok: true }; // managed manually
  const cur = currentRank(current.tier, current.billing);
  const req = requestedRank(requested);
  if (req > cur) return { ok: true };
  if (req === cur) {
    return {
      ok: false,
      reason: current.tier === 'daily'
        ? "Your Day Pass is still active — you can upgrade to Pro, but you can't buy another Day Pass yet."
        : "You're already on this plan. You can upgrade, but not re-buy the same plan while it's active.",
    };
  }
  return {
    ok: false,
    reason: "You're already on a higher plan — you can change plans once your current one expires.",
  };
}
