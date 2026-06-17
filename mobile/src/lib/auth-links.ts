// src/lib/auth-links.ts — deep-link target for the password-reset email.
//
// `resetPasswordForEmail({ redirectTo })` tells Supabase where to send the
// user after they tap the recovery link in their inbox. We point it at a
// `remotejobs44://reset-password` deep link so the link reopens the app on the
// "set new password" screen (app/reset-password.tsx) instead of the website.
//
// Setup required (one-time, Supabase dashboard → Auth → URL Configuration →
// Redirect URLs): allow-list `remotejobs44://**`. This is the SAME wildcard the
// native OAuth flow needs (see lib/oauth.ts) — if it's already there for social
// sign-in, password reset is covered too. Without it, Supabase falls back to the
// project Site URL and the link dead-ends on the website instead of the app.
import * as Linking from 'expo-linking';

/**
 * The exact URL the recovery email redirects back to. In a dev/standalone build
 * this resolves to `remotejobs44://reset-password`; in Expo Go it becomes an
 * `exp://…/--/reset-password` URL (which can't be allow-listed — reset, like
 * native OAuth, needs a dev or production build to round-trip cleanly).
 */
export const resetPasswordRedirectUri = Linking.createURL('/reset-password');
