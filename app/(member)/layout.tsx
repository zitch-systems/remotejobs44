// app/(member)/layout.tsx
//
// Wraps every signed-in route in the member shell (top bar + left sidebar).
// The marketing Header / Footer / BottomNav hide themselves on these routes
// (see lib/member-routes.ts), so the MemberShell owns the full viewport.
//
// Route group — does NOT change URLs: app/(member)/dashboard → /dashboard.
//
// member.css is imported HERE (not in the root layout) so its ~28KB of
// `.member-*` styles only ship on signed-in routes. Loading it globally made
// it render-blocking CSS on every marketing route — including the landing —
// where none of its selectors are ever used.
import '../member.css';
import { MemberShell } from '@/components/member/MemberShell';

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return <MemberShell>{children}</MemberShell>;
}
