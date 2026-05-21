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
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = createClient();
  const [checking, setChecking] = useState(true);
  const [adminName, setAdminName] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login?next=/admin'); return; }
      const { data: profile } = await supabase
        .from('profiles').select('role, name').eq('id', session.user.id).single();
      if (profile?.role !== 'admin') { router.replace('/dashboard'); return; }
      setAdminName(profile?.name ?? session.user.email ?? 'Admin');
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-stone-400">
          <span className="w-5 h-5 border-2 border-stone-300 border-t-brand-600 rounded-full animate-spin" />
          Verifying admin access…
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-stone-200 dark:border-[#1a3d2e] bg-white dark:bg-[#0a1f18]">
        {/* Admin badge */}
        <div className="p-4 border-b border-stone-100 dark:border-[#1a3d2e]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-700 dark:bg-brand-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-brand-700 dark:text-brand-400 uppercase tracking-wider">Admin Panel</p>
              <p className="text-xs text-stone-400 truncate">{adminName}</p>
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
                {active && <ChevronRight className="w-3 h-3 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        {/* Back to site */}
        <div className="p-3 border-t border-stone-100 dark:border-[#1a3d2e]">
          <Link href="/" className="flex items-center gap-2 px-3 py-2 text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 rounded-lg hover:bg-stone-50 dark:hover:bg-[#0f2820] transition-colors">
            ← Back to site
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto bg-stone-50 dark:bg-[#0a1f18]">
        {children}
      </main>
    </div>
  );
}
