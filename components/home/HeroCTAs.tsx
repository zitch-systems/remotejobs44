'use client';
// components/home/HeroCTAs.tsx
//
// Auth-aware primary CTAs in the hero. Logged-out visitors see
// "Get Started Free / Log In"; logged-in visitors see
// "Browse All Jobs / View Plans". Subscribes to useAuthStore via
// a narrow selector so this island re-renders only on user-id
// changes, not on every store mutation.
//
// We default to unauthed during hydration: landing-page visitors are
// overwhelmingly NOT logged in, so showing Sign-Up immediately
// maximises the primary conversion CTA. Brief flicker for the
// authed cohort is the right trade.
import Link from 'next/link';
import { ArrowRight, LogIn, UserPlus } from 'lucide-react';
import { useAuthStore } from '@/lib/store';

export function HeroCTAs() {
  const isUnauthed = useAuthStore(s => !s.user);

  if (isUnauthed) {
    return (
      <>
        <Link href="/register"
          className="flex items-center gap-2 px-7 py-3.5 bg-brand-700 dark:bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-800 transition-colors text-sm shadow-md-brand">
          <UserPlus className="w-4 h-4" /> Get Started Free <ArrowRight className="w-4 h-4" />
        </Link>
        <Link href="/login"
          className="flex items-center gap-2 px-7 py-3.5 border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 font-bold rounded-xl hover:bg-stone-50 dark:hover:bg-[#0a1628] transition-colors text-sm">
          <LogIn className="w-4 h-4" /> Log In
        </Link>
      </>
    );
  }
  return (
    <>
      <Link href="/jobs"
        className="flex items-center gap-2 px-7 py-3.5 bg-brand-700 dark:bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-800 transition-colors text-sm shadow-md-brand">
        Browse All Jobs <ArrowRight className="w-4 h-4" />
      </Link>
      <Link href="/pricing"
        className="flex items-center gap-2 px-7 py-3.5 border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 font-bold rounded-xl hover:bg-stone-50 dark:hover:bg-[#0a1628] transition-colors text-sm">
        View Plans
      </Link>
    </>
  );
}
