'use client';
// components/layout/BottomNav.tsx
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Briefcase, FileText, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const BOTTOM_NAV = [
  { href: '/',             icon: Home,      label: 'Home' },
  { href: '/jobs',         icon: Briefcase, label: 'Jobs' },
  { href: '/applications', icon: FileText,  label: 'Applied' },
  { href: '/profile',      icon: User,      label: 'Profile' },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#152B20] border-t border-stone-200 dark:border-[#234533] grid grid-cols-4 pb-safe"
      aria-label="Mobile navigation"
    >
      {BOTTOM_NAV.map(({ href, icon: Icon, label }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={cn('bottom-nav-item', active && 'active')}>
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
