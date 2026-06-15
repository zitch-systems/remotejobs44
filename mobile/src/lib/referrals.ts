// src/lib/referrals.ts — the signed-in user's referral code + invite count.
// The code lives on profiles.referral_code (migration_v40); the referrals table
// records confirmed sign-ups. Attribution (inserting a referrals row when a new
// user joins via ?ref=CODE) is done server-side — the app only reads the code
// to share and counts confirmed referrals. Degrades gracefully (a derived code,
// count 0) when the migration isn't applied yet or in demo mode.
import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from './supabase';
import { useAppStore } from '@/store/app';

/** Invites needed to unlock the reward (kept in sync with the web grant). */
export const REWARD_GOAL = 3;

export interface ReferralState {
  code: string;
  count: number;
}

const SEED_REFERRAL: ReferralState = { code: 'RJ44DEMO', count: 0 };

/** Stable, human-readable fallback code derived from the user id. */
function makeCode(seed: string): string {
  const base = seed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `RJ${base}`.slice(0, 8).padEnd(6, 'X');
}

/** Read the profile's referral_code, generating + persisting one if absent. */
export async function fetchReferralCode(userId: string): Promise<string> {
  try {
    const { data, error } = await supabase.from('profiles').select('referral_code').eq('id', userId).maybeSingle();
    if (error) throw error;
    const existing = (data?.referral_code as string | null) ?? null;
    if (existing) return existing;
    const code = makeCode(userId);
    await supabase.from('profiles').update({ referral_code: code }).eq('id', userId);
    return code;
  } catch {
    // Column / migration not present yet — fall back to a derived code.
    return makeCode(userId);
  }
}

/** Count confirmed referrals (joined or rewarded) for this user. */
export async function fetchReferralCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_id', userId)
    .in('status', ['joined', 'rewarded']);
  if (error) throw error;
  return count ?? 0;
}

/** Referral code + invite count with a seed fallback (demo) + loading + reload. */
export function useReferral(): { state: ReferralState; goal: number; loading: boolean; reload: () => void } {
  const userId = useAppStore((s) => s.userId);
  const [state, setState] = useState<ReferralState>(SEED_REFERRAL);
  const [loading, setLoading] = useState(Boolean(isSupabaseConfigured && userId));
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) {
      setState(SEED_REFERRAL);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    (async () => {
      const code = await fetchReferralCode(userId);
      const count = await fetchReferralCount(userId).catch(() => 0);
      if (active) {
        setState({ code, count });
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, nonce]);

  return { state, goal: REWARD_GOAL, loading, reload: () => setNonce((n) => n + 1) };
}
