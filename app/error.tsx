'use client';
import Link from 'next/link';
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Surface the real error in the browser console for devs / power users
  // without leaking it to the rendered page. error.digest is the
  // Next.js correlation id we can ask support to quote.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[app/error]', error);
  }, [error]);

  return (
    <div className="min-h-[70dvh] flex items-center justify-center px-5">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 mb-3">
          Something went wrong
        </h1>
        <p className="text-stone-400 dark:text-stone-500 mb-6 text-sm">
          An unexpected error occurred. Refresh the page, or come back in a moment.
          {error.digest && (
            <> <span className="block mt-2 font-mono text-[10px] text-stone-400">ref: {error.digest}</span></>
          )}
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={reset}
            className="px-6 py-3 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-xl hover:bg-brand-600 transition-colors">
            Try Again
          </button>
          <Link href="/"
            className="px-6 py-3 border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 font-bold rounded-xl hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
