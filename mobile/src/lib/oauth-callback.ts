import { parseAuthCallbackUrl } from './auth-callback';
import { supabase } from './supabase';

export type OAuthCallbackResult = { status: 'success' } | { status: 'error'; message: string };

interface OAuthCallbackDependencies {
  exchangeCode: (code: string) => Promise<{ error: { message?: string } | null }>;
}

/** Create an idempotent callback completer; exported for focused regression tests. */
export function createOAuthCallbackCompleter(deps: OAuthCallbackDependencies) {
  const completions = new Map<string, Promise<OAuthCallbackResult>>();

  return (url: string): Promise<OAuthCallbackResult> => {
    const callback = parseAuthCallbackUrl(url);
    if (callback.error) {
      return Promise.resolve({ status: 'error', message: 'Social sign-in was cancelled or denied. Please try again.' });
    }
    if (!callback.code) {
      return Promise.resolve({ status: 'error', message: 'The sign-in link is incomplete. Return to sign in and try again.' });
    }

    const existing = completions.get(callback.code);
    if (existing) return existing;

    const completion = (async (): Promise<OAuthCallbackResult> => {
      const { error } = await deps.exchangeCode(callback.code!);
      if (!error) return { status: 'success' };

      return { status: 'error', message: error.message ?? 'Could not complete social sign-in. Please try again.' };
    })().catch(
      (): OAuthCallbackResult => ({ status: 'error', message: 'Could not complete social sign-in. Check your connection and try again.' }),
    );

    completions.set(callback.code, completion);
    completion.then((result) => {
      // Keep successful results for later route/browser duplicates. A failed
      // exchange is evicted so an intentional retry is not pinned to failure.
      if (result.status === 'error' && completions.get(callback.code!) === completion) {
        completions.delete(callback.code!);
      }
    });
    return completion;
  };
}

export const completeOAuthCallback = createOAuthCallbackCompleter({
  exchangeCode: async (code) => {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return { error };
  },
});
