'use client';
// components/layout/MainShell.tsx
//
// Wraps the page content in <main>. On marketing routes it keeps the
// `.app-main` class (which reserves the fixed Header height + safe-area
// insets). On member routes the marketing Header is hidden, so we drop that
// offset and let the MemberShell own the full viewport.
import { usePathname } from 'next/navigation';
import { isMemberRoute } from '@/lib/member-routes';

export function MainShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Member routes hide the marketing Header (MemberShell owns the chrome) and
  // so does the /admin portal (its dark sidebar owns the full viewport) — both
  // must drop the fixed-header offset or they'd render below a blank gap.
  const chromeless = isMemberRoute(pathname) || pathname.startsWith('/admin');
  return (
    <main id="main-content" className={chromeless ? 'flex-1' : 'flex-1 app-main'}>
      {children}
    </main>
  );
}
