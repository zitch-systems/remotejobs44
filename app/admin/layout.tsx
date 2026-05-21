'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Briefcase, Users, BarChart3,
  Rss, Building2, Settings, CreditCard,
  PlusCircle, ChevronRight, Shield
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin',               icon: LayoutDashboard, label: 'Overview',      exact: true },
  { href: '/admin/jobs',          icon: Briefcase,       label: 'Jobs'                       },
  { href: '/admin/jobs/new',      icon: PlusCircle,      label: 'Post Job',     indent: true  },
  { href: '/admin/users',         icon: Users,           label: 'Users'                      },
  { href: '/admin/subscriptions', icon: CreditCard,      label: 'Subscriptions'              },
  { href: '/admin/analytics',     icon: BarChart3,       label: 'Analytics'                  },
  { href: '/admin/sources',       icon: Rss,             label: 'Job Sources'                },
  { href: '/admin/company-import',icon: Building2,       label: 'Bulk Import'                },
  { href: '/admin/settings',      icon: Settings,        label: 'Settings'                   },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname();
  const router    = useRouter();
  const [checking, setChecking] = useState(true);
  const [adminName, setAdminName] = useState('');
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function checkAdmin() {
      try {
        const supabase = createClient();
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (cancelled) return;
        if (sessionError || !session) { router.replace('/login?next=/admin'); return; }

        const { data: profile, error: profileError } = await supabase
          .from('profiles').select('role, name').eq('id', session.user.id).single();

        if (cancelled) return;

        if (profileError && profileError.code !== 'PGRST116') {
          setAccessError('Failed to load profile. Please try again.');
          setChecking(false);
          return;
        }

        if (profile?.role !== 'admin') { router.replace('/dashboard'); return; }

        setAdminName(profile?.name ?? session.user.email ?? 'Admin');
        setChecking(false);
      } catch {
        if (!cancelled) {
          setAccessError('Unable to verify admin access. Please refresh.');
          setChecking(false);
        }
      }
    }

    checkAdmin();
    return () => { cancelled = true; };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8faff] dark:bg-[#0f1e38]">
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <div className="w-10 h-10 rounded-full animate-spin" style={{ border: '3px solid #bfdbfe', borderTopColor: '#2563eb' }} />
          <p className="text-sm font-medium">Verifying admin access…</p>
        </div>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8faff] dark:bg-[#0f1e38]">
        <div className="text-center space-y-3">
          <p className="text-red-500 font-semibold">{accessError}</p>
          <button onClick={() => window.location.reload()}
            className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-slate-200 dark:border-[#1e3a5f] bg-white dark:bg-[#0a1628]">
        {/* Admin badge */}
        <div className="p-4 border-b border-slate-100 dark:border-[#1e3a5f]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-sm">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider">Admin Panel</p>
              <p className="text-xs text-slate-400 truncate">{adminName}</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map(({ href, icon: Icon, label, exact, indent }) => {
            const active = exact ? pathname === href : pathname.startsWith(href) && href !== '/admin';
            return (
              <Link key={href} href={href}
                className={cn('admin-nav-item', active && 'active', indent && 'pl-10 text-xs')}>
                <Icon className="w-4 h-4 shrink-0" />
                {label}
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        {/* Back to site */}
        <div className="p-3 border-t border-slate-100 dark:border-[#1e3a5f]">
          <Link href="/" className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-[#162033] transition-colors">
            ← Back to site
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto bg-[#f8faff] dark:bg-[#0f1e38]">
        {children}
      </main>
    </div>
  );
}
