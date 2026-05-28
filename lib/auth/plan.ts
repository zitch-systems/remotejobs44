// lib/auth/plan.ts
// Single source of truth for "what plan should the client display?"
//
// The webhook race: after a successful Paystack charge, the verify route
// stamps `profile.plan_expires_at` to a future date before the subscription
// webhook flips `profile.plan` away from 'free'. During that gap the DB
// row reads {plan: 'free', plan_expires_at: <future>}, which any caller
// that trusted plan='free' would interpret as "downgrade the user".
//
// Conversely, the daily expire-cron only runs once a day (Hobby quota), so
// `profile.plan` can read 'daily' or 'pro' for up to ~23h after the real
// expiry. plan_expires_at in the past is the authoritative signal there.
//
// resolvePlan encodes both rules + the admin override + the
// keep-the-higher-persisted-plan guard, so Header / login / profile /
// dashboard / pricing / /api/profile can't drift out of agreement.

export type Plan = 'free' | 'daily' | 'pro' | 'admin';

type Input = {
  role: 'admin' | 'user' | string | null | undefined;
  dbPlan: string | null | undefined;
  planExpiresAt: string | null | undefined;
  /**
   * The plan currently in Zustand (or whichever client cache). Used to
   * absorb the webhook race: if the DB says 'free' but the expiry proves
   * payment landed, keep showing the higher persisted value rather than
   * flickering back to "Upgrade".
   */
  currentClientPlan?: string | null;
};

export function resolvePlan(input: Input): Plan {
  const { role, dbPlan, planExpiresAt, currentClientPlan } = input;

  if (role === 'admin') return 'admin';

  const now = Date.now();
  const expiryMs = planExpiresAt ? new Date(planExpiresAt).getTime() : null;
  const hasFutureExpiry = expiryMs !== null && expiryMs >= now;
  const expired         = expiryMs !== null && expiryMs < now;

  let effective: Plan;
  if (expired)                effective = 'free';
  else if (dbPlan === 'daily' || dbPlan === 'pro' || dbPlan === 'admin')
                              effective = dbPlan;
  else                        effective = 'free';

  // Webhook race: DB column still 'free' but expiry proves payment landed.
  // Keep whatever non-free plan the client already had — verify route /
  // post-success handler / /pricing optimistic update set it.
  if (effective === 'free' && hasFutureExpiry && currentClientPlan && currentClientPlan !== 'free') {
    return currentClientPlan as Plan;
  }
  return effective;
}
