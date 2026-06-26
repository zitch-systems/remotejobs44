// lib/auth/free-trial.ts
// Single source of truth for the registered-user free trial.
//
// Every registered (free-plan) user gets a small allowance of free job
// applications for a fixed window after they sign up. Once they've used
// the allowance OR the window has elapsed — whichever comes first — they
// are told to subscribe.
//
// The rules live here so the server gate (/api/applications) and the
// client UI (JobCard / JobActionsCard "Apply" buttons) can't drift out of
// agreement about how many applies are left or whether the trial is over.

/** Number of free applications a registered user gets. */
export const FREE_TRIAL_APPLICATIONS = 3;
/** Length of the free-trial window, in days, measured from registration. */
export const FREE_TRIAL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Epoch-ms timestamp when a user's free trial window closes, or null when
 * we can't determine the registration date (treat that as "no window cap").
 */
export function freeTrialEndsAt(registeredAt: string | Date | null | undefined): number | null {
  if (!registeredAt) return null;
  const startedMs = registeredAt instanceof Date ? registeredAt.getTime() : new Date(registeredAt).getTime();
  if (!Number.isFinite(startedMs)) return null;
  return startedMs + FREE_TRIAL_DAYS * DAY_MS;
}

export type FreeTrialState = {
  /** Within the window AND still has applications remaining. */
  canApply: boolean;
  /** Applications left in the trial, clamped to 0..FREE_TRIAL_APPLICATIONS. */
  remaining: number;
  /** The 7-day window has elapsed. */
  windowExpired: boolean;
  /** Window still open but all free applications are used up. */
  limitReached: boolean;
  /** Epoch-ms the window closes (null when registration date unknown). */
  endsAt: number | null;
};

/**
 * Evaluate the free-trial state for a registered user.
 *
 * @param registeredAt  When the account was created (profiles.created_at).
 * @param used          How many applications the user has already submitted.
 * @param now           Injectable clock for tests; defaults to Date.now().
 */
export function evaluateFreeTrial(opts: {
  registeredAt: string | Date | null | undefined;
  used: number;
  now?: number;
}): FreeTrialState {
  const now = opts.now ?? Date.now();
  const endsAt = freeTrialEndsAt(opts.registeredAt);
  const windowExpired = endsAt !== null && now > endsAt;

  const usedSafe = Number.isFinite(opts.used) ? Math.max(0, Math.floor(opts.used)) : 0;
  const remaining = Math.max(0, FREE_TRIAL_APPLICATIONS - usedSafe);
  const limitReached = remaining <= 0;

  return {
    canApply: !windowExpired && !limitReached,
    remaining,
    windowExpired,
    limitReached,
    endsAt,
  };
}

/**
 * Human-facing message shown when a registered user can no longer apply for
 * free. Mirrors the copy returned by the /api/applications gate so the toast
 * a user sees matches the server's reason.
 */
export function freeTrialBlockedMessage(state: Pick<FreeTrialState, 'windowExpired'>): string {
  return state.windowExpired
    ? `Your ${FREE_TRIAL_DAYS}-day free trial has ended. Subscribe to keep applying.`
    : `You've used all ${FREE_TRIAL_APPLICATIONS} free applications. Subscribe to apply for more jobs.`;
}
