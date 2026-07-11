'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Briefcase, Users, BarChart3,
  Rss, Building2, Settings, CreditCard,
  PlusCircle, ChevronRight, Shield, LogOut, Brain, ShieldCheck, Mail, Receipt, Megaphone, Radar
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
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-slate-200 dark:border-[#1e2d4a] bg-white dark:bg-[#0a1628]">
        <div className="p-4 border-b border-slate-100 dark:border-[#1e2d4a]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: '#2563eb' }}>
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#2563eb' }}>
                Admin Panel
              </p>
              <p className="text-xs text-slate-400 truncate">{adminName}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV.map(({ href, icon: Icon, label, exact, indent }) => {
            const active = exact
              ? pathname === href
              : pathname.startsWith(href) && href !== '/admin';
            return (
              <Link key={href} href={href} className={cn(
                'flex items-center gap-3 px-5 py-2.5 text-sm font-medium border-r-2 border-transparent transition-all',
                'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-[#111c35]',
                active && 'font-semibold border-r-[#2563eb]',
                indent && 'pl-11 text-xs',
              )}
              style={active ? { color: '#2563eb', background: '#eff6ff' } : {}}>
                <Icon className="w-4 h-4 shrink-0" />
                {label}
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-100 dark:border-[#1e2d4a] space-y-1">
          <Link href="/" className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-[#111c35] transition-colors">
            ← Back to site
          </Link>
          <button onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
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
      <div className="md:hidden fixed app-menu-top left-0 right-0 z-30 bg-white dark:bg-[#0a1628] border-b border-slate-200 dark:border-[#1e2d4a] px-4 py-2">
        <select
          aria-label="Admin section"
          value={
            // Longest matching href wins so /admin/jobs/new selects "Post
            // Job", not "Jobs"; falls back to Overview.
            NAV.filter(n => (n.exact ? pathname === n.href : pathname.startsWith(n.href)))
               .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? '/admin'
          }
          onChange={e => router.push(e.target.value)}
          className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-[#1e2d4a] bg-white dark:bg-[#0f1e38] text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          {NAV.map(({ href, label, indent }) => (
            <option key={href} value={href}>{indent ? `— ${label}` : label}</option>
          ))}
        </select>
      </div>

      <main className="flex-1 min-w-0 overflow-auto bg-[#f8faff] dark:bg-[#0f1e38] md:pt-0 pt-14">
        {children}
      </main>
    </div>
  );
}
