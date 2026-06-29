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
  const member = isMemberRoute(pathname);
  return (
    <main id="main-content" className={member ? 'flex-1' : 'flex-1 app-main'}>
      {children}
    </main>
  );
}
