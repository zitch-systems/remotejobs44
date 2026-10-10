// src/lib/session-change.ts — subscribe to genuine auth-session changes.
import { supabase } from './supabase';

/**
 * Run `onChange` when the auth session changes (sign-in/out, token refresh,
 * account switch, user update). Returns the unsubscribe function.
 *
 * supabase-js replays the CURRENT session to every new onAuthStateChange
 * subscriber as an INITIAL_SESSION event. That is a snapshot of state the
 * caller already has, not a change — and every data hook that subscribes also
 * loads on mount. Treating the replay as a change invalidated the request the
 * hook had just started and issued it again: two /api/jobs calls on every cold
 * start and every job-detail open, a flash of the empty/loading state, and a
 * wipe of the cached feed page painted a moment earlier.
 */
export function onSessionChange(onChange: () => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'INITIAL_SESSION') return;
    onChange();
  });
  return () => data.subscription.unsubscribe();
}
