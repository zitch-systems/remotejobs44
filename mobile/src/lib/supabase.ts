// src/lib/supabase.ts — the native Supabase client.
//
// Reuses the SAME backend (auth, RLS, tables) as the web app. Session tokens
// persist in AsyncStorage and auto-refresh while the app is foregrounded
// (the AppState wiring below is the pattern from the Supabase RN guide).
//
// Security note: AsyncStorage is unencrypted. For production you may want a
// SecureStore-backed adapter (expo-secure-store is already installed) — but
// SecureStore has a ~2KB per-key limit and Supabase sessions can exceed it,
// so it needs a chunking/`LargeSecureStore` adapter. Tracked in README.
import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** True only when both public env vars are present (see .env.example). */
export const isSupabaseConfigured = Boolean(url && anonKey);

// Fall back to harmless placeholders so createClient() doesn't throw at import
// time when env is missing — the UI gates real calls on isSupabaseConfigured.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // No URL-based session detection on native (that's a web-only concern).
      detectSessionInUrl: false,
    },
  },
);

// Refresh the session only while the app is in the foreground; pausing in the
// background avoids needless token churn / network on a sleeping device.
AppState.addEventListener('change', (state) => {
  if (!isSupabaseConfigured) return;
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
