import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '404 – Page Not Found' };

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-5">
      <div className="text-center max-w-md">
        <div className="font-display font-extrabold text-[120px] leading-none text-brand-100 dark:text-brand-900 select-none">
          404
        </div>
        <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 mt-4 mb-3">
          Page not found
        </h1>
        <p className="text-stone-400 dark:text-stone-500 mb-8 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link href="/"
            className="px-6 py-3 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-xl hover:bg-brand-600 transition-colors">
            Go Home
          </Link>
          <Link href="/jobs"
            className="px-6 py-3 border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 font-bold rounded-xl hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
            Browse Jobs
          </Link>
        </div>
      </div>
    </div>
  );
}
