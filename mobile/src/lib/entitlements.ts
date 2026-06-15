// src/lib/entitlements.ts — pure plan → feature gating. Single source of truth
// for what each plan can do (AI tools, daily application cap). Unit-tested.
import type { Plan } from './profile';

export const FREE_DAILY_APPLICATIONS = 10;

export function isPaid(plan: Plan): boolean {
  return plan === 'pro' || plan === 'daily' || plan === 'admin';
}

/** AI CV review + interview prep are a paid feature. */
export function canUseAI(plan: Plan): boolean {
  return isPaid(plan);
}

/** Daily application cap — Free is limited, paid is unlimited. */
export function applicationLimit(plan: Plan): number {
  return isPaid(plan) ? Infinity : FREE_DAILY_APPLICATIONS;
}

export function applicationsLeft(plan: Plan, usedToday: number): number {
  const limit = applicationLimit(plan);
  return limit === Infinity ? Infinity : Math.max(0, limit - Math.max(0, usedToday));
}

export function canApply(plan: Plan, usedToday: number): boolean {
  return applicationsLeft(plan, usedToday) > 0;
}
