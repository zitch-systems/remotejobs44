// src/lib/entitlements.ts — pure plan → feature gating. Single source of truth
// for what each plan can do (AI tools, application allowance). Unit-tested.
//
// Application gating follows the same free-trial model as the web app
// (lib/auth/free-trial.ts): registered free users get a small allowance of
// applications within a window from signup; paid plans are unlimited. The
// trial math lives in ./free-trial so phone and web stay in lock-step.
import type { Plan } from './profile';
import { evaluateFreeTrial } from './free-trial';

export { FREE_TRIAL_APPLICATIONS, FREE_TRIAL_DAYS, freeTrialBlockedMessage } from './free-trial';

export function isPaid(plan: Plan): boolean {
  return plan === 'pro' || plan === 'daily' || plan === 'admin';
}

/** AI CV review + interview prep are a paid feature. */
export function canUseAI(plan: Plan): boolean {
  return isPaid(plan);
}

/** Inputs for the free-trial application gate (ignored for paid plans). */
export interface TrialContext {
  /** profiles.created_at — when the free trial window started. */
  registeredAt: string | Date | null | undefined;
  /** Applications the user has already submitted (server-authoritative count). */
  used: number;
  /** Injectable clock for tests. */
  now?: number;
}

/** Applications still available to this user. Infinity for paid plans. */
export function applicationsLeft(plan: Plan, trial: TrialContext): number {
  if (isPaid(plan)) return Infinity;
  return evaluateFreeTrial(trial).remaining;
}

/** Whether this user may submit another application right now. */
export function canApply(plan: Plan, trial: TrialContext): boolean {
  if (isPaid(plan)) return true;
  return evaluateFreeTrial(trial).canApply;
}
