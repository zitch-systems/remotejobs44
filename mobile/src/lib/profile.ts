// src/lib/profile.ts — the signed-in user's profile + job preferences.
// Core profile columns are guaranteed; preferences (skills/target_role/
// headline) come from migration_v38 and are read/written best-effort so the
// app degrades gracefully if that migration hasn't been applied yet.
import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from './supabase';
import { useAppStore } from '@/store/app';
import { SEED_USER } from './seed';

export interface UserProfile {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  completion: number; // profile_completion 0–100 (server-computed)
  cvUrl: string | null;
}

export interface UserPreferences {
  skills: string[];
  targetRole: string | null;
  headline: string | null;
}

const SEED_PROFILE: UserProfile = {
  name: SEED_USER.name,
  email: SEED_USER.email,
  avatarUrl: null,
  completion: SEED_USER.profileStrength,
  cvUrl: SEED_USER.cvName,
};

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('name,email,avatar_url,profile_completion,cv_url')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    name: data.name ?? '',
    email: data.email ?? null,
    avatarUrl: data.avatar_url ?? null,
    completion: data.profile_completion ?? 20,
    cvUrl: data.cv_url ?? null,
  };
}

export async function saveName(userId: string, name: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ name }).eq('id', userId);
  if (error) throw error;
}

/** Best-effort: returns defaults if the preferences columns aren't present. */
export async function fetchPreferences(userId: string): Promise<UserPreferences> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('skills,target_role,headline')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return {
      skills: (data?.skills as string[] | null) ?? [],
      targetRole: (data?.target_role as string | null) ?? null,
      headline: (data?.headline as string | null) ?? null,
    };
  } catch {
    return { skills: [], targetRole: null, headline: null };
  }
}

export async function savePreferences(userId: string, prefs: UserPreferences): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ skills: prefs.skills, target_role: prefs.targetRole, headline: prefs.headline })
    .eq('id', userId);
  if (error) throw error;
}

/** Core profile with seed fallback (demo) + loading + reload. */
export function useProfile(): { profile: UserProfile; loading: boolean; reload: () => void } {
  const userId = useAppStore((s) => s.userId);
  const [profile, setProfile] = useState<UserProfile>(SEED_PROFILE);
  const [loading, setLoading] = useState(Boolean(isSupabaseConfigured && userId));
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) {
      setProfile(SEED_PROFILE);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    fetchProfile(userId)
      .then((p) => active && p && (setProfile(p), setLoading(false)))
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [userId, nonce]);

  return { profile, loading, reload: () => setNonce((n) => n + 1) };
}
