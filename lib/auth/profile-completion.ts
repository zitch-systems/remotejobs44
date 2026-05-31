// lib/auth/profile-completion.ts
//
// Single source of truth for the profile-completion % the UI shows on
// /profile and /dashboard. Previously hardcoded to 20 (signup) or 80
// (after CV upload) regardless of whether the user had actually done
// anything in between, so the number drifted from reality immediately
// after the first /api/cv upload.
//
// Five signals, all worth distinct amounts so the ring fills as users
// complete real, meaningful steps:
//
//   * Name set to something other than the email-prefix default  +20
//   * Email confirmed (auth.users.email_confirmed_at is non-null) +20
//   * CV uploaded (profiles.cv_url is set)                        +30
//   * ≥1 application                                              +15
//   * ≥1 saved job                                                +15
//
// Capped at 100. Recomputed on every /api/profile GET — the route
// writes the new value back to profiles.profile_completion when it
// drifts so direct DB reads stay reasonable too.

export interface ProfileCompletionSignals {
  /** profiles.name. Default at signup is the email-prefix
   *  (`john` from `john@example.com`) — treat as "not set yet". */
  name:             string | null | undefined;
  email:            string | null | undefined;
  /** auth.users.email_confirmed_at — ISO string or null. */
  emailConfirmedAt: string | null | undefined;
  /** profiles.cv_url. Non-null + non-empty means a CV is on file. */
  cvUrl:            string | null | undefined;
  /** Count of rows in `applications` for the user. */
  applicationsCount: number;
  /** Count of rows in `saved_jobs` for the user. */
  savedJobsCount:    number;
}

export function computeProfileCompletion(s: ProfileCompletionSignals): number {
  let pct = 0;

  const emailLocal = (s.email ?? '').split('@')[0]?.toLowerCase() ?? '';
  const nameTrimmed = (s.name ?? '').trim();
  // "Real name set" = not empty AND not the literal email-prefix
  // fallback. The fallback is what /api/profile + the auth/callback
  // upsert assign when raw_user_meta_data.name is missing.
  if (nameTrimmed.length > 0 && nameTrimmed.toLowerCase() !== emailLocal) {
    pct += 20;
  }
  if (s.emailConfirmedAt) {
    pct += 20;
  }
  if (s.cvUrl && String(s.cvUrl).trim().length > 0) {
    pct += 30;
  }
  if (s.applicationsCount > 0) {
    pct += 15;
  }
  if (s.savedJobsCount > 0) {
    pct += 15;
  }

  return Math.min(100, pct);
}
