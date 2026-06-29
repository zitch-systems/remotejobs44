// lib/member-routes.ts
// Single source of truth for which routes render inside the signed-in
// "member shell" (top bar + left sidebar) instead of the marketing
// chrome (Header / Footer / BottomNav).
//
// Used by:
//   - app/(member)/layout.tsx  → wraps these pages in <MemberShell>
//   - components/layout/{Header,Footer,BottomNav}.tsx → hide on member routes
//   - components/layout/MainShell.tsx → drops the header-offset padding
//
// Keep this list in sync with the directories under app/(member)/.

export const MEMBER_ROUTE_PREFIXES = [
  '/dashboard',
  '/applications',
  '/saved',
  '/profile',
  '/settings',
  '/alerts',
  // Member tool screens
  '/cv',
  '/cover-letters',
  '/match',
  '/interview',
  '/interview-prep',
] as const;

/** True when `pathname` is (or is nested under) a member-shell route. */
export function isMemberRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return MEMBER_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}
