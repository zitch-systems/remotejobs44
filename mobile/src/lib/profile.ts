// src/lib/profile.ts — the signed-in user's profile + job preferences.
// Core profile columns are guaranteed; preferences (skills/target_role/
// headline) come from migration_v38 and are read best-effort so the app
// degrades gracefully if that migration hasn't been applied yet.
//
// Reads, and saving the display name, go straight to Supabase. Every other
// write (preferences, details, photo, CV) goes through the web API — see
// ./profile-api — because the database only lets the app update `name`.
import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from './supabase';
import { useAppStore } from '@/store/app';
import { SEED_USER } from './seed';
import { EMPTY_DETAILS, type ExperienceItem, type ProfileDetails, type ProfileLinks } from './profile-details';
import { subscribeEntitlementInvalidation } from './entitlement-invalidation';
import { resolveMobilePlan } from './plan';

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

export type Plan = 'free' | 'daily' | 'pro' | 'admin';

/**
 * Effective plan, honouring plan_expires_at. The daily expire-cron runs only
 * once a day, so profiles.plan can read 'daily'/'pro' for hours after the real
 * expiry; an expiry in the past is the authoritative downgrade signal (mirrors
 * the web app's resolvePlan). Admins never expire.
 */
export function resolveEffectivePlan(
  plan: Plan,
  planExpiresAt: string | null | undefined,
  role: string | null | undefined = 'user',
  suspended = false,
): Plan {
  return resolveMobilePlan({ dbPlan: plan, planExpiresAt, role, suspended });
}

export interface UserProfile {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  completion: number; // profile_completion 0–100 (server-computed)
  cvUrl: string | null;
  /** Effective plan (already downgraded to 'free' if plan_expires_at lapsed). */
  plan: Plan;
  billing: 'daily' | 'monthly' | 'annually' | null;
  billingError: boolean;
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
  billing: null,
  billingError: false,
  registeredAt: null,
};

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const [{ data, error }, { data: subscription, error: subscriptionError }] = await Promise.all([
    supabase.from('profiles').select('name,email,avatar_url,profile_completion,cv_url,plan,plan_expires_at,created_at,role,suspended').eq('id', userId).maybeSingle(),
    supabase.from('subscriptions').select('billing,status,current_period_end').eq('user_id', userId).maybeSingle(),
  ]);
  if (error) throw error;
  if (!data) return null;
  return {
    name: data.name ?? '',
    email: data.email ?? null,
    avatarUrl: data.avatar_url ?? null,
    completion: data.profile_completion ?? 20,
    cvUrl: data.cv_url ?? null,
    // Honour plan_expires_at so a lapsed Pro/daily user can't keep paid perks.
    plan: resolveEffectivePlan((data.plan as Plan) ?? 'free', data.plan_expires_at as string | null, data.role as string | null, data.suspended === true),
    billing: !subscriptionError && subscription?.status === 'active' ? (subscription.billing as UserProfile['billing']) : null,
    billingError: Boolean(subscriptionError),
    registeredAt: (data.created_at as string | null) ?? null,
  };
}

// Writes the database won't take from the app directly; see the header comment.
export { savePreferences, saveDetails, uploadAvatar, uploadCv } from './profile-api';

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

/** Core profile with seed fallback (demo) + loading + reload. */
export function useProfile(): { profile: UserProfile; loading: boolean; reload: () => void } {
  const userId = useAppStore((s) => s.userId);
  const [profile, setProfile] = useState<UserProfile>(SEED_PROFILE);
  const [loading, setLoading] = useState(Boolean(isSupabaseConfigured && userId));
  const [nonce, setNonce] = useState(0);

  useEffect(() => subscribeEntitlementInvalidation(() => {
    // Never leave paid state visible while the authoritative refresh runs.
    setProfile(SEED_PROFILE);
    setLoading(true);
    setNonce((n) => n + 1);
  }), []);

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
