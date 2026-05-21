'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Briefcase, Rss, PlusCircle, BarChart3, Settings, Users, Globe, Upload } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin',                icon: <LayoutDashboard className="w-4 h-4" />, label: 'Overview',       exact: true },
  { href: '/admin/sources',        icon: <Rss className="w-4 h-4" />,            label: 'Job Sources' },
  { href: '/admin/vc-boards',      icon: <Globe className="w-4 h-4" />,          label: 'VC Boards' },
  { href: '/admin/company-import', icon: <Upload className="w-4 h-4" />,         label: 'Bulk Import' },
  { href: '/admin/jobs',           icon: <Briefcase className="w-4 h-4" />,      label: 'Manage Jobs' },
  { href: '/admin/jobs/new',       icon: <PlusCircle className="w-4 h-4" />,     label: 'Post a Job' },
  { href: '/admin/users',          icon: <Users className="w-4 h-4" />,          label: 'Users' },
  { href: '/admin/analytics',      icon: <BarChart3 className="w-4 h-4" />,      label: 'Analytics' },
  { href: '/admin/settings',       icon: <Settings className="w-4 h-4" />,       label: 'Settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, isAdmin } = useAuthStore();

  useEffect(() => {
    if (!isLoggedIn()) { router.replace('/login'); return; }
    if (!isAdmin()) { router.replace('/dashboard'); }
  }, [isLoggedIn, isAdmin, router]);

  return (
    <div className="flex min-h-[calc(100vh-68px)]">
      <aside className="hidden md:flex w-56 shrink-0 border-r border-stone-200 dark:border-[#234533] bg-white dark:bg-[#152B20] flex-col">
        <div className="px-4 py-4 border-b border-stone-100 dark:border-[#234533]">
          <span className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">Admin Panel</span>
        </div>
        <nav className="flex-1 py-2">
          {NAV.map(item => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className={cn('admin-nav-item', active && 'active')}>
                {item.icon}
                <span>{item.label}</span>
                {item.href === '/admin/company-import' && (
                  <span className="ml-auto px-1.5 py-0.5 rounded text-xs font-bold bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400">New</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-stone-100 dark:border-[#234533]">
          <Link href="/" className="text-xs text-stone-400 dark:text-stone-500 hover:text-brand-700 dark:hover:text-brand-400 transition-colors">← Back to site</Link>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-stone-50 dark:bg-[#0D1F18]">{children}</main>
    </div>
  );
}
