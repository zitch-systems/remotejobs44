// src/lib/account.ts — account actions: password reset + account deletion.
// Thin wrappers over Supabase; the screen (app/profile/settings.tsx) handles UX.
import { supabase } from './supabase';

/** Email the signed-in user a password-reset link. */
export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

/**
 * Permanently delete the signed-in user's account via the `delete-account`
 * edge function (verifies the JWT + deletes with the service role). The caller
 * should sign out afterwards.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account');
  if (error) throw error;
}
