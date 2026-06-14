// src/lib/supabase.ts — the native Supabase client.
//
// Reuses the SAME backend (auth, RLS, tables) as the web app. The session is
// persisted ENCRYPTED at rest (LargeSecureStore: AES key in the device
// keystore, ciphertext in AsyncStorage) on native; web falls back to
// AsyncStorage. PKCE flow is enabled for the native OAuth redirect (see
// app/(auth)/sign-in.tsx).
import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { LargeSecureStore } from './secure-store-adapter';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** True only when both public env vars are present (see .env.example). */
export const isSupabaseConfigured = Boolean(url && anonKey);

// Encrypted storage on device; plain AsyncStorage on web (no SecureStore there).
const storage = Platform.OS === 'web' ? AsyncStorage : LargeSecureStore;

// Fall back to harmless placeholders so createClient() doesn't throw at import
// time when env is missing — the UI gates real calls on isSupabaseConfigured.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      // PKCE is the recommended flow for native OAuth deep-link redirects.
      flowType: 'pkce',
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
