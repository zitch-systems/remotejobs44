export type MobilePlan = 'free' | 'daily' | 'pro' | 'admin';

/** Mobile counterpart of the server's authoritative resolvePlan rules. */
export function resolveMobilePlan(input: {
  dbPlan: string | null | undefined;
  planExpiresAt: string | null | undefined;
  role: string | null | undefined;
  suspended?: boolean;
}): MobilePlan {
  if (input.suspended) return 'free';
  if (input.role === 'admin') return 'admin';
  if (input.planExpiresAt) {
    const expiry = new Date(input.planExpiresAt).getTime();
    if (!Number.isFinite(expiry) || expiry < Date.now()) return 'free';
  }
  return input.dbPlan === 'daily' || input.dbPlan === 'pro' ? input.dbPlan : 'free';
}

export type BillingSelection = 'daily' | 'pro' | 'annual';

/** Purchases are strict upgrades: daily → monthly/annual, monthly → annual. */
export function canChooseBillingSelection(
  plan: MobilePlan,
  billing: 'daily' | 'monthly' | 'annually' | null,
  selection: BillingSelection,
): boolean {
  if (plan === 'admin') return false;
  const currentRank = plan === 'pro' ? (billing === 'annually' ? 3 : 2) : plan === 'daily' ? 1 : 0;
  const requestedRank = selection === 'annual' ? 3 : selection === 'pro' ? 2 : 1;
  return requestedRank > currentRank;
}
