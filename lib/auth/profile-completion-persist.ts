// lib/auth/profile-completion-persist.ts
//
// Server-side helper that recomputes a user's profile_completion %
// from the current truth (auth.users.email_confirmed_at,
// profiles.name + cv_url, applications + saved_jobs counts) and
// persists the result to the column. Idempotent — caller doesn't
// have to know the previous value.
//
// Why this exists: the /api/profile GET handler ALSO recalculates
// and write-backs. But dashboard / login / pricing read
// profile_completion directly from Supabase, not through that route,
// so the column would stay at the round-30 hardcoded literal until
// a /api/profile call eventually refreshed it. Calling this helper
// from every write path that affects a signal (CV upload, new
// application, new saved job) keeps the column accurate for direct
// readers too.
//
// Callers fire this fire-and-forget — failures are logged but never
// surfaced. The route handler should NOT await it on the critical
// path because the recalc requires two extra count queries.
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { computeProfileCompletion } from '@/lib/auth/profile-completion';
import { logError } from '@/lib/log';

interface UserHandle {
  id:                string;
  email:             string | null | undefined;
  emailConfirmedAt:  string | null | undefined;
}

/** Recompute and persist profile_completion for the given user. */
export async function recomputeAndPersistProfileCompletion(user: UserHandle): Promise<void> {
  try {
    const admin = createAdminSupabaseClient();
    const [
      { data: profile },
      { count: applicationsCount },
      { count: savedJobsCount },
    ] = await Promise.all([
      admin.from('profiles').select('name, email, cv_url, target_role, cv_text, profile_completion').eq('id', user.id).maybeSingle(),
      admin.from('applications').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      admin.from('saved_jobs').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ]);

    // No row yet — let the next /api/profile GET create it. There's
    // nothing safe to compute against.
    if (!profile) return;

    const computed = computeProfileCompletion({
      name:              profile.name,
      email:             user.email ?? profile.email,
      emailConfirmedAt:  user.emailConfirmedAt,
      cvUrl:             profile.cv_url,
      targetRole:        profile.target_role,
      cvText:            profile.cv_text,
      applicationsCount: applicationsCount ?? 0,
      savedJobsCount:    savedJobsCount    ?? 0,
    });

    if (computed === (profile.profile_completion ?? 0)) return;

    const { error } = await admin
      .from('profiles')
      .update({ profile_completion: computed, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) {
      logError({ event: 'profile_completion.persist_failed', user_id: user.id, error: error.message });
    }
  } catch (err) {
    logError({ event: 'profile_completion.persist_unhandled', user_id: user.id, error: (err as Error)?.message ?? String(err) });
  }
}
