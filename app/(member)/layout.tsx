// app/(member)/layout.tsx
//
// Wraps every signed-in route in the member shell (top bar + left sidebar).
// The marketing Header / Footer / BottomNav hide themselves on these routes
// (see lib/member-routes.ts), so the MemberShell owns the full viewport.
//
// Route group — does NOT change URLs: app/(member)/dashboard → /dashboard.
import { MemberShell } from '@/components/member/MemberShell';

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return <MemberShell>{children}</MemberShell>;
}
