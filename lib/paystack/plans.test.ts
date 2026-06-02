import { describe, it, expect } from 'vitest';
import {
  PLAN_AMOUNTS_KOBO, isValidPlan, getPlanTier, getBilling,
  getPlanExpiry, chargeMatchesPlan, canPurchase,
} from './plans';

describe('isValidPlan', () => {
  it('accepts the three real plans', () => {
    expect(isValidPlan('daily')).toBe(true);
    expect(isValidPlan('pro')).toBe(true);
    expect(isValidPlan('pro_annual')).toBe(true);
  });
  it('rejects unknown / falsy values', () => {
    expect(isValidPlan('free')).toBe(false);
    expect(isValidPlan('admin')).toBe(false);
    expect(isValidPlan('')).toBe(false);
    expect(isValidPlan(null)).toBe(false);
    expect(isValidPlan(undefined)).toBe(false);
    expect(isValidPlan(0)).toBe(false);
  });
});

describe('getPlanTier', () => {
  it('pro_annual collapses to pro (annual bills as pro)', () => {
    expect(getPlanTier('pro_annual')).toBe('pro');
    expect(getPlanTier('pro')).toBe('pro');
  });
  it('daily stays daily, anything else is free', () => {
    expect(getPlanTier('daily')).toBe('daily');
    expect(getPlanTier('unknown')).toBe('free');
    expect(getPlanTier('')).toBe('free');
  });
});

describe('getBilling', () => {
  it('maps plan → billing cadence', () => {
    expect(getBilling('daily')).toBe('daily');
    expect(getBilling('pro')).toBe('monthly');
    expect(getBilling('pro_annual')).toBe('annually');
    expect(getBilling('whatever')).toBe('monthly'); // safe default
  });
});

describe('chargeMatchesPlan', () => {
  // These tests pin the tampering-attack defence. The webhook calls
  // chargeMatchesPlan as the last check before crediting a paid plan —
  // if it falsely returns true for a low charge tagged with a high-tier
  // plan, the customer gets pro_annual access for ₦500.

  it('accepts the exact amount + NGN', () => {
    expect(chargeMatchesPlan('daily',      50000,   'NGN')).toBe(true);
    expect(chargeMatchesPlan('pro',        299900,  'NGN')).toBe(true);
    expect(chargeMatchesPlan('pro_annual', 2999900, 'NGN')).toBe(true);
  });

  it('allows ≤100 kobo rounding tolerance', () => {
    expect(chargeMatchesPlan('pro', 299850, 'NGN')).toBe(true);   // 50 under
    expect(chargeMatchesPlan('pro', 299999, 'NGN')).toBe(true);   // 99 over
    expect(chargeMatchesPlan('pro', 300000, 'NGN')).toBe(true);   // exactly 100 over
  });

  it('rejects amounts beyond the tolerance', () => {
    expect(chargeMatchesPlan('pro', 299799, 'NGN')).toBe(false);  // 101 under
    expect(chargeMatchesPlan('pro', 300001, 'NGN')).toBe(false);  // 101 over
    // The headline attack: "pay daily, claim pro_annual"
    expect(chargeMatchesPlan('pro_annual', 50000, 'NGN')).toBe(false);
    // "pay nothing, claim pro"
    expect(chargeMatchesPlan('pro', 0, 'NGN')).toBe(false);
    expect(chargeMatchesPlan('pro', null, 'NGN')).toBe(false);
    expect(chargeMatchesPlan('pro', undefined, 'NGN')).toBe(false);
  });

  it('rejects non-NGN currency even with the right amount', () => {
    expect(chargeMatchesPlan('pro', 299900, 'USD')).toBe(false);
    expect(chargeMatchesPlan('pro', 299900, null)).toBe(false);
    expect(chargeMatchesPlan('pro', 299900, '')).toBe(false);
  });

  it('rejects unknown plan even with a valid-looking amount', () => {
    // Webhook should never credit a row whose plan tag we don't recognise.
    expect(chargeMatchesPlan('mystery_tier', 299900, 'NGN')).toBe(false);
    expect(chargeMatchesPlan('free',         0,      'NGN')).toBe(false);
  });

  it('keeps PLAN_AMOUNTS_KOBO and the matcher in sync', () => {
    // If anyone adds a new plan to PLAN_AMOUNTS_KOBO without updating
    // isValidPlan / chargeMatchesPlan, this catches it. The matcher
    // should agree with the table for every entry.
    for (const [plan, amount] of Object.entries(PLAN_AMOUNTS_KOBO)) {
      expect(chargeMatchesPlan(plan, amount, 'NGN')).toBe(true);
    }
  });
});

describe('getPlanExpiry', () => {
  it('daily expires in 24h', () => {
    const from = new Date('2026-05-29T12:00:00Z');
    const out  = getPlanExpiry('daily', from);
    expect(out.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('pro adds one calendar month with day-clamping', () => {
    // Jan 31 + 1 month → Feb 28 (not Mar 3 as naive setMonth(+1) would do)
    const from = new Date('2026-01-31T12:00:00Z');
    const out  = getPlanExpiry('pro', from);
    expect(out.getUTCMonth()).toBe(1); // Feb
    expect(out.getUTCDate()).toBe(28);
  });

  it('pro_annual handles leap-year Feb 29', () => {
    // Feb 29, 2028 → Feb 28, 2029 (2029 is not a leap year)
    const from = new Date('2028-02-29T12:00:00Z');
    const out  = getPlanExpiry('pro_annual', from);
    expect(out.getUTCFullYear()).toBe(2029);
    expect(out.getUTCMonth()).toBe(1); // Feb
    expect(out.getUTCDate()).toBe(28);
  });

  it('pro on a 30-day month rolls forward cleanly', () => {
    // Apr 30 + 1 month → May 30 (no clamp needed; May has 31 days)
    const from = new Date('2026-04-30T12:00:00Z');
    const out  = getPlanExpiry('pro', from);
    expect(out.getUTCMonth()).toBe(4); // May
    expect(out.getUTCDate()).toBe(30);
  });
});

describe('canPurchase', () => {
  it('free / expired users can buy anything', () => {
    expect(canPurchase({ tier: 'free' }, 'daily').ok).toBe(true);
    expect(canPurchase({ tier: 'free' }, 'pro').ok).toBe(true);
    expect(canPurchase({ tier: 'free' }, 'pro_annual').ok).toBe(true);
  });

  it('Day Pass blocks another Day Pass but allows a Pro upgrade', () => {
    expect(canPurchase({ tier: 'daily' }, 'daily').ok).toBe(false);
    expect(canPurchase({ tier: 'daily' }, 'pro').ok).toBe(true);
    expect(canPurchase({ tier: 'daily' }, 'pro_annual').ok).toBe(true);
  });

  it('Pro monthly: upgrade to annual ok; re-buy / downgrade blocked', () => {
    expect(canPurchase({ tier: 'pro', billing: 'monthly' }, 'pro_annual').ok).toBe(true);
    expect(canPurchase({ tier: 'pro', billing: 'monthly' }, 'pro').ok).toBe(false);
    expect(canPurchase({ tier: 'pro', billing: 'monthly' }, 'daily').ok).toBe(false);
  });

  it('Pro annual is the top tier — nothing left to buy', () => {
    expect(canPurchase({ tier: 'pro', billing: 'annually' }, 'pro_annual').ok).toBe(false);
    expect(canPurchase({ tier: 'pro', billing: 'annually' }, 'pro').ok).toBe(false);
    expect(canPurchase({ tier: 'pro', billing: 'annually' }, 'daily').ok).toBe(false);
  });

  it('Pro with unknown billing is treated as monthly (annual upgrade allowed)', () => {
    expect(canPurchase({ tier: 'pro' }, 'pro_annual').ok).toBe(true);
    expect(canPurchase({ tier: 'pro' }, 'pro').ok).toBe(false);
  });

  it('admins are managed manually and may purchase', () => {
    expect(canPurchase({ tier: 'admin' }, 'pro').ok).toBe(true);
  });

  it('blocked results carry a reason', () => {
    const d = canPurchase({ tier: 'pro', billing: 'monthly' }, 'pro');
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toMatch(/upgrade/i);
  });
});
