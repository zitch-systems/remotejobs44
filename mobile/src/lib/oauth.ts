// src/lib/oauth.ts — native social sign-in (PKCE) for Google / LinkedIn.
//
// Flow: ask Supabase for the provider URL (skipBrowserRedirect), open it in an
// in-app auth session, then exchange the returned ?code for a session. The
// auth-state listener (lib/auth.tsx) then flips the app to signed-in.
//
// Setup required (one-time, in the Supabase dashboard):
//   - Enable the Google + LinkedIn (OIDC) providers with their client creds.
//   - Add the redirect URL to Auth → URL Configuration → Redirect URLs. Use the
//     wildcard `remotejobs44://**` so dev/standalone builds all match. The exact
//     value the app uses is `oauthRedirectUri` below and is logged to the dev
//     console on every attempt.
//
// THE #1 FAILURE MODE — "Google opens but never comes back": if the redirect URL
// is NOT in the allow-list, Supabase falls back to redirecting to the project's
// Site URL (https://remotejobs44.com) after the provider sign-in. The in-app
// browser then just sits on the website instead of returning to the app via the
// `remotejobs44://` scheme, so sign-in silently dead-ends. Fix = allow-list it.
//
// NOTE: native OAuth does NOT work in Expo Go — the custom `remotejobs44://`
// scheme only exists in a development or standalone build. In Expo Go the
// redirect resolves to a dynamic `exp://…` URL that can't be allow-listed, so we
// fail fast with a clear message rather than opening a browser that can't return.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

// Lets the in-app browser settle any pending auth session on cold start.
WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = 'google' | 'linkedin_oidc';

/** True when running inside the Expo Go sandbox (no custom URL scheme). */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * The EXACT redirect URL the provider returns to. This value — or a wildcard
 * that covers it, e.g. `remotejobs44://**` — MUST be in Supabase → Auth → URL
 * Configuration → Redirect URLs, or sign-in can't return to the app.
 */
// Use a PATH (not a bare scheme): `remotejobs44://auth-callback`. On Android a
// bare `remotejobs44://` is unreliably intercepted by the in-app browser, so the
// OAuth redirect can slip past and land the user back on sign-in. A path is
// matched reliably. The wildcard `remotejobs44://**` in the Supabase allow-list
// covers this value.
export const oauthRedirectUri = makeRedirectUri({ scheme: 'remotejobs44', path: 'auth-callback' });

export async function signInWithProvider(provider: OAuthProvider): Promise<void> {
  // Expo Go can't use the custom scheme — opening a browser here would only
  // dead-end on the website. Tell the user exactly what to do instead.
  if (isExpoGo) {
    throw new Error(
      "Social sign-in needs a development or production build — it can't work in " +
        'Expo Go. Use a dev build (eas build --profile development) or sign in with ' +
        'email + password.',
    );
  }

  // Surface the exact value to allow-list — copy this into the Supabase dashboard
  // if social sign-in doesn't return to the app.
  if (__DEV__) console.log('[oauth] redirectTo =', oauthRedirectUri);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: oauthRedirectUri, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start sign-in.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, oauthRedirectUri);

  // User explicitly closed the sheet → quiet cancel, no error.
  if (result.type === 'cancel' || result.type === 'dismiss') return;
  // Anything other than a clean success means the provider never redirected back
  // to `oauthRedirectUri` — almost always because it isn't allow-listed. Don't
  // swallow it: tell the user (and the logs) the precise value to allow-list.
  if (result.type !== 'success') {
    throw new Error(
      `Sign-in didn't return to the app. Add "${oauthRedirectUri}" to Supabase → ` +
        'Auth → URL Configuration → Redirect URLs.',
    );
  }

  const { params, errorCode } = QueryParams.getQueryParams(result.url);
  if (errorCode) throw new Error(errorCode);
  if (!params.code) throw new Error('No authorization code returned from the provider.');

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
  if (exchangeError) throw exchangeError;
}
