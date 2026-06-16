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
  // Deterministic standalone redirect: remotejobs44:// . This EXACT value must be
  // in Supabase → Auth → URL Configuration → Redirect URLs, or the provider
  // won't redirect back into the app after sign-in.
  const redirectTo = makeRedirectUri({ scheme: 'remotejobs44' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start sign-in.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return; // user dismissed / cancelled

  const { params, errorCode } = QueryParams.getQueryParams(result.url);
  if (errorCode) throw new Error(errorCode);
  if (!params.code) throw new Error('No authorization code returned.');

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
  if (exchangeError) throw exchangeError;
}
