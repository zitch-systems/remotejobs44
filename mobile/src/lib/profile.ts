// src/lib/profile.ts — the signed-in user's profile + job preferences.
// Core profile columns are guaranteed; preferences (skills/target_role/
// headline) come from migration_v38 and are read/written best-effort so the
// app degrades gracefully if that migration hasn't been applied yet.
import { useEffect, useState } from 'react';
import { File } from 'expo-file-system';
import { isSupabaseConfigured, supabase } from './supabase';
import { useAppStore } from '@/store/app';
import { SEED_USER } from './seed';

/**
 * Upload a picked CV file to the `cvs` storage bucket (under the user's folder)
 * and save its URL on the profile. Requires migration_v39 (the bucket).
 */
export async function uploadCv(userId: string, asset: { uri: string; name: string; mimeType?: string | null }): Promise<string> {
  const ext = (asset.name.split('.').pop() || 'pdf').toLowerCase();
  const path = `${userId}/cv-${Date.now()}.${ext}`;
  const buffer = await new File(asset.uri).arrayBuffer();

  const { error } = await supabase.storage.from('cvs').upload(path, buffer, {
    contentType: asset.mimeType ?? 'application/octet-stream',
    upsert: true,
  });
  if (error) throw error;

  const url = supabase.storage.from('cvs').getPublicUrl(path).data.publicUrl;
  const { error: upErr } = await supabase.from('profiles').update({ cv_url: url }).eq('id', userId);
  if (upErr) throw upErr;
  return url;
}

export type Plan = 'free' | 'daily' | 'pro' | 'admin';

export interface UserProfile {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  completion: number; // profile_completion 0–100 (server-computed)
  cvUrl: string | null;
  plan: Plan;
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
  plan: 'free',
};

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('name,email,avatar_url,profile_completion,cv_url,plan')
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
    plan: (data.plan as Plan) ?? 'free',
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
