'use client';
// lib/member/use-member-gate.ts
//
// Lightweight client-side auth gate for the member tool screens. Mirrors the
// pattern used by /profile, /applications and /saved (which have no
// middleware gate): once the auth store has been confirmed against the
// Supabase session (`hydrated`), bounce signed-out visitors to /login with a
// `next` param so they return after authenticating.
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

export function useMemberGate(): { ready: boolean } {
  const router = useRouter();
  const pathname = usePathname();
  const { user, hydrated } = useAuthStore();

  useEffect(() => {
    if (hydrated && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname || '/dashboard')}`);
    }
  }, [hydrated, user, pathname, router]);

  return { ready: hydrated && !!user };
}
