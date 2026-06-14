// app/reset-password/page.tsx — Server shell + ResetPasswordForm island.
// Was 'use client' over the whole tree (including the static logo +
// heading) with a Suspense fallback that never fired because there's
// no useSearchParams call in the children.
import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Set new password | RemoteJobs44',
  description: 'Set a new password for your RemoteJobs44 account.',
  alternates: { canonical: 'https://remotejobs44.com/reset-password' },
  robots: { index: false, follow: false }, // password-reset isn't indexable
};

export default function ResetPasswordPage() {
  return (
    <div className="min-h-[80dvh] flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 font-display font-bold text-xl text-stone-900 dark:text-stone-100">
            <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none">
              <rect width="32" height="32" rx="8" fill="#2563eb"/>
              <path d="M8 20 Q12 10 16 16 Q20 22 23 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <circle cx="23" cy="12" r="2.5" fill="#f97316"/>
            </svg>
            RemoteJobs44
          </Link>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 mt-6 mb-1">Set new password</h1>
          <p className="text-sm text-stone-400 dark:text-stone-500">Choose a strong password for your account</p>
        </div>
        <ResetPasswordForm />
      </div>
    </div>
  );
}
