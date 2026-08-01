// app/forgot-password/page.tsx — Server shell + ForgotPasswordForm island.
// Page was 'use client' over the whole tree even though only the form
// needs interactivity.
import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Forgot your RemoteJobs44 password? Enter your email and we will send a reset link.',
  alternates: { canonical: 'https://remotejobs44.com/forgot-password' },
  robots: { index: false, follow: false }, // password-reset isn't indexable
};

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-[80dvh] flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 mb-1">Reset your password</h1>
          <p className="text-sm text-stone-400 dark:text-stone-500">Enter your email and we&rsquo;ll send a reset link</p>
        </div>
        <ForgotPasswordForm />
        <p className="text-center text-sm text-stone-400 mt-5">
          <Link href="/login" className="text-brand-700 dark:text-brand-400 font-semibold hover:underline">← Back to login</Link>
        </p>
      </div>
    </div>
  );
}
