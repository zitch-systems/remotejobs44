'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Briefcase, Users, BarChart3,
  Rss, Building2, Settings, CreditCard,
  PlusCircle, ChevronRight, Shield, LogOut, Brain, ShieldCheck, Mail, Receipt, Megaphone, Radar, ArrowLeftRight
} from 'lucide-react';
import { createClient, getAuthedUserSafe } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { resolveRole } from '@/lib/auth/redirect';
import { useAuthStore } from '@/lib/store';
import { isHardcodedAdmin } from '@/lib/admin-emails';
import { ADMIN_MFA_REQUIRED } from '@/lib/auth/mfa';

// Admin access is determined solely by the 'role' column in the profiles table.
// To grant admin access, set role = 'admin' directly in the Supabase dashboard.

const NAV = [
  { href: '/admin',               icon: LayoutDashboard, label: 'Overview',      exact: true  },
  { href: '/admin/jobs',          icon: Briefcase,       label: 'Jobs'                        },
  { href: '/admin/jobs/new',      icon: PlusCircle,      label: 'Post Job',      indent: true  },
  { href: '/admin/companies',     icon: Building2,       label: 'Companies'                   },
  { href: '/admin/users',         icon: Users,           label: 'Users'                       },
  { href: '/admin/agents',        icon: Megaphone,       label: 'Agents'                      },
  { href: '/admin/subscriptions', icon: CreditCard,      label: 'Subscriptions'               },
  { href: '/admin/payments',      icon: Receipt,         label: 'Payments'                    },
  { href: '/admin/analytics',     icon: BarChart3,       label: 'Analytics'                   },
  { href: '/admin/company-import',icon: Building2,       label: 'Bulk Import'                 },
  { href: '/admin/ai-discovery',   icon: Brain,           label: 'AI Discovery'                },
  { href: '/admin/jobspy',        icon: Radar,           label: 'JobSpy'                      },
  { href: '/admin/sources',       icon: Rss,             label: 'Sources'                     },
  { href: '/admin/broadcasts',    icon: Mail,            label: 'Broadcasts'                  },
  { href: '/admin/audit',         icon: ShieldCheck,     label: 'Audit Log'                   },
  { href: '/admin/settings',      icon: Settings,        label: 'Settings'                    },
  { href: '/security/2fa',        icon: Shield,          label: 'Two-Factor Auth'             },
];

// Sibling project for the cross-project switcher. Only the NAME is exposed
// client-side (the button label); the sibling's actual admin URL is a
// server-only value read by app/admin/switch/route.ts, so the sibling's admin
// path never lands in this app's public JS bundle. Defaults to TransformCV so
// the toggle works out of the box; override the label with the
// NEXT_PUBLIC_ADMIN_SIBLING_NAME env var, or set it to a single space to hide
// the switcher.
const SIBLING_NAME = (process.env.NEXT_PUBLIC_ADMIN_SIBLING_NAME ?? 'TransformCV').trim();

// Cross-project switcher. "RemoteJobs44 (current)" + a link to /admin/switch,
// a server route that redirects into the sibling project's admin.
function ProjectSwitcher() {
  if (!SIBLING_NAME) return null;
  return (
    <div className="px-3 pt-3">
      <div className="rounded-lg border border-[#1e2d4a] overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-[#111c35]">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#60a5fa' }} />
          <span className="text-xs font-bold text-white truncate">RemoteJobs44</span>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-500 shrink-0">current</span>
        </div>
        {/* Plain <a>: this hits a server route that 302s to another origin, so
            we want a full navigation, not a client-router push. */}
        <a href="/admin/switch"
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-[#111c35] border-t border-[#1e2d4a] transition-colors">
          <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
          Switch to {SIBLING_NAME}
        </a>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  // Subscribe to the store (not getState() — that returns the initial null
  // before Zustand persist rehydrates, defeating the optimistic path on cold
  // loads). With the hook, this component re-renders when persist finishes
  // pulling from localStorage and we get the real user.
  const persistedUser = useAuthStore(s => s.user);
  const persistedAdmin = !!(persistedUser?.role === 'admin'
    || persistedUser?.plan === 'admin'
    || isHardcodedAdmin(persistedUser?.email ?? null));

  const [verifiedReady, setVerifiedReady] = useState(false);
  // ready is true as soon as EITHER the persisted user looks like an admin
  // (instant render after rehydration) OR the background check confirms.
  // If the persisted guess is wrong, the background check redirects away.
  const ready = persistedAdmin || verifiedReady;
  const [adminName, setAdminName] = useState(persistedUser?.name ?? persistedUser?.email?.split('@')[0] ?? '');

  useEffect(() => {
    if (!adminName && persistedUser) {
      setAdminName(persistedUser.name ?? persistedUser.email?.split('@')[0] ?? '');
    }
  }, [persistedUser, adminName]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let profileFetchTries = 0;

    async function check() {
      const supabase = createClient();
      const { user, status } = await getAuthedUserSafe(supabase);

      if (cancelled) return;
      if (status === 'unauthed') { router.replace('/login?next=/admin'); return; }
      if (status === 'transient') {
        // Network blip — retry once after 2s rather than silently giving up.
        // Without this, an offline-flap leaves us stuck on the optimistic
        // path if persistedAdmin was true, or on the spinner if it was false.
        retryTimer = setTimeout(() => { if (!cancelled) check(); }, 2000);
        return;
      }
      if (!user) { router.replace('/login?next=/admin'); return; }

      let profile: { role?: string; name?: string; plan?: string } | null = null;
      try {
        const queryPromise = supabase
          .from('profiles')
          .select('role, name, plan')
          .eq('id', user.id)
          .maybeSingle()
          .then(({ data }) => data);
        const timeoutPromise = new Promise<null>(res => setTimeout(() => res(null), 5000));
        profile = await Promise.race([queryPromise, timeoutPromise]);
      } catch {}

      if (cancelled) return;

      // A failed/timed-out profile fetch is NOT proof the user isn't an
      // admin. For a DB-only admin (role lives in the profiles row, email
      // not in the hardcoded list) resolveRole() falls back to 'user' on a
      // null profile and bounces them to /dashboard — which is exactly the
      // "logged in as admin but landed on the dashboard / session expired"
      // report. Only send to /dashboard once we've POSITIVELY read a
      // non-admin row; on a null fetch with any admin signal, retry instead.
      if (!profile) {
        const persistedRole = useAuthStore.getState().user?.role;
        const looksAdmin = isHardcodedAdmin(user.email) || persistedRole === 'admin';
        if (looksAdmin) {
          if (profileFetchTries < 4) {
            profileFetchTries++;
            retryTimer = setTimeout(() => { if (!cancelled) check(); }, 1500);
          } else {
            // Couldn't confirm via the row after retries, but we have an
            // admin signal — render the panel (admin API routes still
            // enforce requireAdmin server-side) rather than bounce.
            setVerifiedReady(true);
          }
          return;
        }
        // No admin signal anywhere — treat as a member.
        router.replace('/dashboard');
        return;
      }

      const role = resolveRole({ profileRole: profile.role, email: user.email });
      if (role !== 'admin') {
        router.replace('/dashboard');
        return;
      }

      // Two-factor gate (when enabled): a confirmed admin must hold a valid
      // email-2FA session cookie before the panel. Ask the server (the cookie
      // is httpOnly, so JS can't read it) and route to /security/2fa otherwise.
      // The /api/admin/* routes enforce the same gate via requireAdmin.
      if (ADMIN_MFA_REQUIRED) {
        try {
          const r = await fetch('/api/admin/2fa/status');
          const s = await r.json().catch(() => ({}));
          if (cancelled) return;
          if (!s?.verified) { router.replace('/security/2fa?next=/admin'); return; }
        } catch { /* network blip — requireAdmin still gates every admin API */ }
      }

      setAdminName(profile.name ?? user.email?.split('@')[0] ?? 'Admin');
      setVerifiedReady(true);
    }
    check();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('sb-') || k.startsWith('supabase') || k.startsWith('rj44')) {
          localStorage.removeItem(k);
        }
      });
    } catch {}
    await supabase.auth.signOut();
    window.location.replace('/login');
  }

  if (!ready) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#f8faff] dark:bg-[#0f1e38]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full animate-spin"
            style={{ border: '3px solid #bfdbfe', borderTopColor: '#2563eb' }} />
          <p className="text-sm text-slate-400">Verifying access…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar — always-dark ink chrome (matches the TransformCV admin tone);
          the content area to the right stays light. */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-[#1e2d4a] bg-[#0a1628] text-slate-300">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-[#1e2d4a]">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: '#2563eb' }}>
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div className="leading-tight min-w-0">
            <p className="text-sm font-bold text-white truncate">RemoteJobs44</p>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em]" style={{ color: '#60a5fa' }}>
              Admin
            </p>
          </div>
        </div>

        <ProjectSwitcher />

        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, icon: Icon, label, exact, indent }) => {
            const active = exact
              ? pathname === href
              : pathname.startsWith(href) && href !== '/admin';
            return (
              <Link key={href} href={href} className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                active
                  ? 'text-white font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-[#111c35]',
                indent && 'pl-9 text-xs',
              )}
              style={active ? { background: '#2563eb' } : {}}>
                <Icon className="w-4 h-4 shrink-0" />
                {label}
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#1e2d4a] space-y-1">
          <div className="px-3 pb-1.5">
            <p className="text-sm font-semibold text-white truncate">{adminName || 'Admin'}</p>
            <p className="text-xs text-slate-500 truncate">{persistedUser?.email ?? ''}</p>
          </div>
          <Link href="/" className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-[#111c35] transition-colors">
            ← Back to site
          </Link>
          <button onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:text-red-300 rounded-lg hover:bg-red-900/20 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Log out
          </button>
        </div>
      </aside>

      {/* Mobile admin nav — a dropdown (admin-only; this layout is already
          role-gated). Replaces the old horizontal pill strip: with 15+
          sections most pills sat hidden off-screen and the strip read as
          clutter. One native <select> shows the current section and jumps on
          change — every admin page reachable in two taps, no sideways
          scrolling. app-menu-top pins it under the safe-area-aware header. */}
      {/* top-0 (not app-menu-top): the marketing header no longer renders on
          /admin, so this bar pins to the viewport top; safe-area padding keeps
          it below a notch. */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-[#0a1628] border-b border-[#1e2d4a] px-4 py-2 flex items-center gap-2"
        style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}>
        <select
          aria-label="Admin section"
          value={
            // Longest matching href wins so /admin/jobs/new selects "Post
            // Job", not "Jobs"; falls back to Overview.
            NAV.filter(n => (n.exact ? pathname === n.href : pathname.startsWith(n.href)))
               .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? '/admin'
          }
          onChange={e => router.push(e.target.value)}
          className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-[#1e2d4a] bg-[#111c35] text-sm font-medium text-slate-200"
        >
          {NAV.map(({ href, label, indent }) => (
            <option key={href} value={href}>{indent ? `— ${label}` : label}</option>
          ))}
        </select>
        {SIBLING_NAME && (
          // Icon-only on mobile: a 36px square tap target next to the section
          // dropdown, so the switcher never squeezes the select. The full
          // labelled "Switch to <project>" control lives in the desktop sidebar.
          <a href="/admin/switch" aria-label={`Switch to ${SIBLING_NAME}`} title={`Switch to ${SIBLING_NAME}`}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-[#1e2d4a] bg-[#111c35] text-slate-300 hover:text-white hover:bg-[#16233f] shrink-0 transition-colors">
            <ArrowLeftRight className="w-4 h-4" />
          </a>
        )}
      </div>

      <main className="flex-1 min-w-0 overflow-auto bg-[#f8faff] dark:bg-[#0f1e38] md:pt-0 pt-14">
        {children}
      </main>
    </div>
  );
}
