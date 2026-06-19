// src/lib/telemetry.ts — lightweight mobile-device registration.
//
// On launch (once authenticated) the app upserts a row into mobile_devices so
// the admin portal can count how many users are on the mobile app and split by
// platform. One row per (user, platform); last_seen refreshes each launch.
// Best-effort — never throws into the caller.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase, isSupabaseConfigured } from './supabase';

export async function registerMobileDevice(userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const platform = Platform.OS; // 'ios' | 'android' | 'web'
  if (platform !== 'ios' && platform !== 'android') return; // native installs only
  try {
    await supabase.from('mobile_devices').upsert(
      {
        user_id: userId,
        platform,
        app_version: Constants.expoConfig?.version ?? null,
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' },
    );
  } catch {
    /* analytics is best-effort; ignore network/permission errors */
  }
}
