// lib/auth/password.ts — single source of truth for password rules.
//
// Before this existed the rules lived inline in three places that had
// drifted apart: the /register strength meter advertised "8+ chars,
// Uppercase, Number", but the /register submit handler only checked
// length, and /reset-password only checked length too. So a weak-but-
// 8-char password (e.g. all lowercase) sailed past the client, hit
// supabase.auth.signUp(), and was rejected by Supabase's stricter
// server-side policy (min length / required character classes / leaked-
// password protection). That raw GoTrue error string was toasted verbatim
// — which reads to a user as a confusing "incorrect password" at signup.
//
// Everything password-related now derives from here so the meter, the
// client-side gate, and the server-error copy always agree.

export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordCheck {
  label: string;
  pass: boolean;
}

/**
 * The individual rules, each with the pass/fail state for `password`.
 * Drives the strength meter AND validatePassword() below, so what the
 * user sees ticked off is exactly what the submit gate enforces.
 */
export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { label: '8+ characters', pass: password.length >= MIN_PASSWORD_LENGTH },
    { label: 'Uppercase',     pass: /[A-Z]/.test(password) },
    { label: 'Number',        pass: /\d/.test(password) },
  ];
}

/**
 * Returns an actionable error message for the FIRST unmet rule, or null
 * when the password satisfies our policy. Naming the specific missing
 * rule (rather than a generic "invalid password") is the whole point —
 * the user learns exactly what to change before we ever call Supabase.
 *
 * Callers should pass the value they'll actually submit (i.e. trimmed),
 * so the rule that's checked matches the rule that Supabase will check.
 */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter';
  }
  if (!/\d/.test(password)) {
    return 'Password must include at least one number';
  }
  return null;
}

/**
 * Supabase / GoTrue returns raw, developer-facing strings from signUp()
 * and updateUser() (e.g. "Password is known to be weak and easy to guess,
 * please choose a different one." or "User already registered"). Surfacing
 * those verbatim is what made a rejected signup look like a cryptic
 * "incorrect password". Translate the common ones into friendly, actionable
 * copy; fall back to a generic line so we never leak raw auth internals.
 *
 * Because validatePassword() already guarantees 8+/uppercase/number before
 * we submit, any password-strength rejection that still reaches here means
 * Supabase wants MORE than we asked for (a longer minimum, a symbol, or the
 * password appeared in a breach) — so the copy nudges toward "stronger /
 * longer / add a symbol" rather than repeating rules the user already met.
 */
export function friendlyAuthError(raw: string | null | undefined): string {
  const m = (raw ?? '').toLowerCase();

  if (
    m.includes('already registered') ||
    m.includes('already been registered') ||
    m.includes('already exists') ||
    m.includes('user already')
  ) {
    return 'An account with this email already exists. Try logging in instead.';
  }

  // Reset flow: GoTrue's `same_password` error ("New password should be
  // different from the old password."). Must be caught BEFORE the strength
  // branch below, which would otherwise match on "password"+"should" and
  // wrongly tell the user to strengthen an already-strong password.
  if (m.includes('different from the old') || m.includes('should be different')) {
    return 'Your new password must be different from your current one.';
  }

  // Leaked-password protection (HaveIBeenPwned) + generic "weak" rejections.
  if (
    m.includes('weak') ||
    m.includes('pwned') ||
    m.includes('known to be') ||
    m.includes('easy to guess') ||
    m.includes('breach')
  ) {
    return 'That password is too common or has appeared in a data breach. Please choose a different one.';
  }

  // Server-side strength policy stricter than ours (longer minimum, or a
  // required symbol). We already enforced 8+/uppercase/number, so guide
  // toward the extra strength rather than repeating met rules.
  if (
    m.includes('password') &&
    (m.includes('should') || m.includes('at least') || m.includes('contain') || m.includes('character'))
  ) {
    return 'Please choose a stronger password — try making it longer or adding a symbol.';
  }

  if (m.includes('rate limit') || m.includes('too many') || m.includes('for security purposes')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  if (m.includes('valid email') || (m.includes('invalid') && m.includes('email'))) {
    return 'Please enter a valid email address.';
  }

  // Unknown error — prefer the raw message (still better than nothing) but
  // guard against empty strings.
  return raw?.trim() || 'Something went wrong. Please try again.';
}
