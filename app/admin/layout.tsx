'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Briefcase, Users, BarChart3,
  Rss, Building2, Settings, CreditCard,
  PlusCircle, ChevronRight, Shield, LogOut, Brain, ShieldCheck, Mail
} from 'lucide-react';
import { createClient, getAuthedUserSafe } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { resolveRole } from '@/lib/auth/redirect';
import { useAuthStore } from '@/lib/store';
import { isHardcodedAdmin } from '@/lib/admin-emails';

// Admin access is determined solely by the 'role' column in the profiles table.
// To grant admin access, set role = 'admin' directly in the Supabase dashboard.

const NAV = [
  { href: '/admin',               icon: LayoutDashboard, label: 'Overview',      exact: true  },
  { href: '/admin/jobs',          icon: Briefcase,       label: 'Jobs'                        },
  { href: '/admin/jobs/new',      icon: PlusCircle,      label: 'Post Job',      indent: true  },
  { href: '/admin/companies',     icon: Building2,       label: 'Companies'                   },
  { href: '/admin/users',         icon: Users,           label: 'Users'                       },
  { href: '/admin/subscriptions', icon: CreditCard,      label: 'Subscriptions'               },
  { href: '/admin/analytics',     icon: BarChart3,       label: 'Analytics'                   },
  { href: '/admin/company-import',icon: Building2,       label: 'Bulk Import'                 },
  { href: '/admin/ai-discovery',   icon: Brain,           label: 'AI Discovery'                },
  { href: '/admin/sources',       icon: Rss,             label: 'Sources'                     },
  { href: '/admin/broadcasts',    icon: Mail,            label: 'Broadcasts'                  },
  { href: '/admin/audit',         icon: ShieldCheck,     label: 'Audit Log'                   },
  { href: '/admin/settings',      icon: Settings,        label: 'Settings'                    },
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

      const role = resolveRole({ profileRole: profile?.role, email: user.email });
      if (role !== 'admin') {
        router.replace('/dashboard');
        return;
      }

      setAdminName(profile?.name ?? user.email?.split('@')[0] ?? 'Admin');
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
      <div className="min-h-screen flex items-center justify-center bg-[#f8faff] dark:bg-[#0f1e38]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full animate-spin"
            style={{ border: '3px solid #bfdbfe', borderTopColor: '#2563eb' }} />
          <p className="text-sm text-slate-400">Verifying access…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
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

      {/* Mobile nav strip */}
      <div className="md:hidden fixed top-[68px] left-0 right-0 z-30 bg-white dark:bg-[#0a1628] border-b border-slate-200 dark:border-[#1e2d4a] px-4 py-2 overflow-x-auto no-scrollbar">
        <div className="flex gap-1 min-w-max">
          {NAV.filter(n => !n.indent).map(({ href, icon: Icon, label, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
                style={active
                  ? { background: '#2563eb', color: '#fff' }
                  : { color: '#64748b' }}>
                <Icon className="w-3.5 h-3.5" />{label}
              </Link>
            );
          })}
        </div>
      </div>

      <main className="flex-1 min-w-0 overflow-auto bg-[#f8faff] dark:bg-[#0f1e38] md:pt-0 pt-12">
        {children}
      </main>
    </div>
  );
}
