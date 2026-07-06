// src/lib/profile.ts — the signed-in user's profile + job preferences.
// Core profile columns are guaranteed; preferences (skills/target_role/
// headline) come from migration_v38 and are read/written best-effort so the
// app degrades gracefully if that migration hasn't been applied yet.
import { useEffect, useState } from 'react';
import { File } from 'expo-file-system';
import { isSupabaseConfigured, supabase } from './supabase';
import { useAppStore } from '@/store/app';
import { SEED_USER } from './seed';
import { EMPTY_DETAILS, type ExperienceItem, type ProfileDetails, type ProfileLinks } from './profile-details';

/**
 * Upload a picked CV file to the `cvs` storage bucket (under the user's folder)
 * and save its storage PATH on the profile. Requires migration_v39 (the bucket).
 *
 * The `cvs` bucket is PRIVATE (personal data), so we must NOT store a
 * getPublicUrl() link — that returns a "Bucket not public" 400 when opened.
 * We store the storage path (`<uid>/cv-<ts>.<ext>`) exactly like the web app
 * (app/api/cv) and mint a short-lived signed URL on demand via
 * getViewableCvUrl(). Returns a signed URL for the immediate post-upload view.
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

  // Persist the PATH (not a URL) so future views can re-sign it after the
  // signed URL's TTL lapses; the web app reads the same column as a path.
  const { error: upErr } = await supabase.from('profiles').update({ cv_url: path }).eq('id', userId);
  if (upErr) throw upErr;

  const { data: signed } = await supabase.storage.from('cvs').createSignedUrl(path, 60 * 60);
  return signed?.signedUrl ?? path;
}

/**
 * Turn a stored `cv_url` value into a viewable, short-lived signed URL.
 * Handles both the current format (a storage path) and legacy rows that stored
 * a full public URL (pre-fix, permanently 401ing) by extracting the object path
 * out of the `/object/public/cvs/<path>` (or `/object/cvs/<path>`) URL so the
 * already-uploaded file is recovered rather than left dead. Returns null when
 * there's no CV or signing fails.
 */
export async function getViewableCvUrl(cvUrl: string | null | undefined): Promise<string | null> {
  if (!cvUrl) return null;
  let path = cvUrl;
  if (/^https?:\/\//i.test(cvUrl)) {
    const m = cvUrl.match(/\/cvs\/(.+?)(?:\?|$)/);
    if (!m) return cvUrl; // unknown URL shape — hand back as-is
    path = decodeURIComponent(m[1]);
  }
  const { data, error } = await supabase.storage.from('cvs').createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Upload a picked image to the `avatars` bucket (under the user's folder) and
 * save its URL as the profile photo. Requires migration_v45 (the bucket).
 */
export async function uploadAvatar(userId: string, asset: { uri: string; name?: string | null; mimeType?: string | null }): Promise<string> {
  const ext = ((asset.name ?? '').split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const buffer = await new File(asset.uri).arrayBuffer();

  const { error } = await supabase.storage.from('avatars').upload(path, buffer, {
    contentType: asset.mimeType ?? 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;

  const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  const { error: upErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
  if (upErr) throw upErr;
  return url;
}

export type Plan = 'free' | 'daily' | 'pro' | 'admin';

/**
 * Effective plan, honouring plan_expires_at. The daily expire-cron runs only
 * once a day, so profiles.plan can read 'daily'/'pro' for hours after the real
 * expiry; an expiry in the past is the authoritative downgrade signal (mirrors
 * the web app's resolvePlan). Admins never expire.
 */
export function resolveEffectivePlan(plan: Plan, planExpiresAt: string | null | undefined): Plan {
  if (plan === 'admin') return 'admin';
  if (planExpiresAt) {
    const expiryMs = new Date(planExpiresAt).getTime();
    if (Number.isFinite(expiryMs) && expiryMs < Date.now()) return 'free';
  }
  return plan;
}

export interface UserProfile {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  completion: number; // profile_completion 0–100 (server-computed)
  cvUrl: string | null;
  /** Effective plan (already downgraded to 'free' if plan_expires_at lapsed). */
  plan: Plan;
  /** profiles.created_at — start of the free-trial window (null in demo mode). */
  registeredAt: string | null;
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
  registeredAt: null,
};

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('name,email,avatar_url,profile_completion,cv_url,plan,plan_expires_at,created_at')
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
    // Honour plan_expires_at so a lapsed Pro/daily user can't keep paid perks.
    plan: resolveEffectivePlan((data.plan as Plan) ?? 'free', data.plan_expires_at as string | null),
    registeredAt: (data.created_at as string | null) ?? null,
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

/** Best-effort structured profile (bio / links / experience). Migration_v43. */
export async function fetchDetails(userId: string): Promise<ProfileDetails> {
  try {
    const { data, error } = await supabase.from('profiles').select('bio,links,experience').eq('id', userId).maybeSingle();
    if (error) throw error;
    return {
      bio: (data?.bio as string | null) ?? '',
      links: (data?.links as ProfileLinks | null) ?? {},
      experience: (data?.experience as ExperienceItem[] | null) ?? [],
    };
  } catch {
    return EMPTY_DETAILS;
  }
}

export async function saveDetails(userId: string, d: ProfileDetails): Promise<void> {
  const { error } = await supabase.from('profiles').update({ bio: d.bio, links: d.links, experience: d.experience }).eq('id', userId);
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
      .then((p) => {
        if (!active) return;
        // A null result (no profile row yet) must still clear loading — the
        // previous `p && …` short-circuit left the spinner up forever.
        if (p) setProfile(p);
        setLoading(false);
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [userId, nonce]);

  return { profile, loading, reload: () => setNonce((n) => n + 1) };
}
