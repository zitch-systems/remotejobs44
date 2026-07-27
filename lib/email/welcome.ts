// lib/email/welcome.ts — exactly-once delivery of the onboarding email.
//
// The welcome email used to be gated on a timestamp heuristic in
// /auth/callback: "created_at and last_sign_in_at are within 30 seconds of
// each other, therefore this is a first login". That holds for OAuth, where
// GoTrue writes both timestamps in the same request. It does not hold for an
// email signup, where created_at is stamped when the form is submitted and
// last_sign_in_at only when the user clicks the link in their inbox — so the
// "gap" being measured was really the user's time-to-open-inbox. The median
// for this project is ~41s, i.e. above the window, and 68% of confirmed email
// signups fell outside it and were silently skipped.
//
// The fallback in /api/profile could not cover for it either: that one only
// runs when the profile row is missing, and the on_auth_user_created trigger
// has created the row at signup since migration_v3.
//
// So: track delivery on the row instead of inferring it. The claim is a
// conditional UPDATE (… WHERE welcome_email_sent_at IS NULL RETURNING id),
// which Postgres applies atomically — two concurrent callers (the callback
// and the dashboard's /api/profile fetch race on every first login) cannot
// both win, so nobody gets two copies. A send that fails releases the claim
// so the next request retries rather than losing the email forever.
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email/send';
import { welcomeEmail } from '@/lib/email/templates';
import { logError, logInfo } from '@/lib/log';

export interface WelcomeEmailTarget {
  userId: string;
  email:  string;
  /** Falls back to the local-part of the address when absent. */
  name?:  string | null;
}

/**
 * Sends the welcome email if — and only if — this user has never been sent
 * one. Safe to call on every authenticated entry point; safe to call
 * concurrently. Requires a service-role client (the `authenticated` role has
 * no UPDATE grant on this column).
 *
 * @returns true when this call actually sent the email.
 */
export async function sendWelcomeEmailOnce(
  admin: SupabaseClient,
  target: WelcomeEmailTarget,
): Promise<boolean> {
  const { userId, email } = target;
  if (!userId || !email) return false;

  const name = (target.name ?? '').trim() || email.split('@')[0];
  const claimedAt = new Date().toISOString();

  // Claim. maybeSingle() rather than single() because "no row matched" is the
  // expected, non-exceptional outcome for every login after the first.
  let claimed: { id: string } | null = null;
  try {
    const { data, error } = await admin
      .from('profiles')
      .update({ welcome_email_sent_at: claimedAt })
      .eq('id', userId)
      .is('welcome_email_sent_at', null)
      .select('id')
      .maybeSingle();

    if (error) {
      // Also the path taken if the code ships before migration_v66 runs:
      // the column doesn't exist, the UPDATE errors, and we skip the send
      // rather than crashing the caller's auth flow.
      logError({ event: 'email.welcome_claim_failed', user_id: userId, error: error.message });
      return false;
    }
    claimed = data;
  } catch (err) {
    logError({
      event:   'email.welcome_claim_threw',
      user_id: userId,
      error:   (err as Error)?.message ?? String(err),
    });
    return false;
  }

  if (!claimed) return false; // already welcomed — the common case

  const { subject, html } = welcomeEmail(name);
  const sent = await sendEmail({ to: email, subject, html });

  if (!sent) {
    // Release the claim so the next authenticated request tries again.
    // Scoped with .eq('welcome_email_sent_at', claimedAt) so we only ever
    // roll back OUR claim — if another process somehow re-stamped the row in
    // between, its value stands.
    try {
      await admin
        .from('profiles')
        .update({ welcome_email_sent_at: null })
        .eq('id', userId)
        .eq('welcome_email_sent_at', claimedAt);
    } catch (err) {
      logError({
        event:   'email.welcome_claim_release_failed',
        user_id: userId,
        error:   (err as Error)?.message ?? String(err),
      });
    }
    logError({ event: 'email.welcome_send_failed', user_id: userId });
    return false;
  }

  logInfo({ event: 'email.welcome_sent', user_id: userId });
  return true;
}
