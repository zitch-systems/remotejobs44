// src/lib/oauth.ts — native social sign-in (PKCE) for Google / LinkedIn.
//
// Flow: ask Supabase for the provider URL (skipBrowserRedirect), open it in an
// in-app auth session, then exchange the returned ?code for a session. The
// auth-state listener (lib/auth.tsx) then flips the app to signed-in.
//
// Setup required (one-time, in the Supabase dashboard):
//   - Enable the Google + LinkedIn (OIDC) providers with their client creds.
//   - Add the app redirect URL (printed by makeRedirectUri — e.g.
//     remotejobs44:// in a dev/standalone build) to Auth → URL configuration.
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

// Lets the in-app browser settle any pending auth session on cold start.
WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = 'google' | 'linkedin_oidc';

export async function signInWithProvider(provider: OAuthProvider): Promise<void> {
  // Deterministic standalone redirect: remotejobs44:// . This value (or a
  // matching wildcard — remotejobs44://** ) MUST be in Supabase → Auth → URL
  // Configuration → Redirect URLs. If it isn't, GoTrue falls back to the Site
  // URL after the provider sign-in, so the in-app browser lands on the website
  // and never deep-links back — the "browser opens but never returns" bug.
  //
  // makeRedirectUri only yields remotejobs44:// in a DEV BUILD or the standalone
  // APK. In Expo Go it returns an exp:// URL the provider can't redirect back
  // from, so Google / LinkedIn sign-in only works in a dev build / APK.
  const redirectTo = makeRedirectUri({ scheme: 'remotejobs44' });
  // Surface the exact value to allow-list — the #1 setup gotcha for native OAuth.
  if (__DEV__) console.log('[oauth] redirectTo (add this to Supabase Redirect URLs):', redirectTo);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start sign-in.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    // 'cancel' / 'dismiss': either the user closed the sheet, or the redirect
    // never came back (most often redirectTo isn't allow-listed in Supabase, so
    // the browser ended on the website). We can't tell those apart, so we stay
    // silent for a genuine cancel but leave a dev breadcrumb for the misconfig.
    if (__DEV__) {
      console.warn(
        `[oauth] auth session closed without returning to ${redirectTo}. ` +
          'If you did not cancel, add "remotejobs44://**" to Supabase → Auth → ' +
          'URL Configuration → Redirect URLs and test on a dev build / APK (not Expo Go).',
      );
    }
    return;
  }

  const { params, errorCode } = QueryParams.getQueryParams(result.url);
  if (errorCode) throw new Error(errorCode);
  if (!params.code) throw new Error('No authorization code returned.');

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
  if (exchangeError) throw exchangeError;
}
