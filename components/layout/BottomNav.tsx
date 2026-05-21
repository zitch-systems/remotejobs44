'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Briefcase, FileText, User, Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, useJobsStore } from '@/lib/store';

const NAV = [
  { href: '/',             icon: Home,      label: 'Home'     },
  { href: '/jobs',         icon: Briefcase, label: 'Jobs'     },
  { href: '/applications', icon: FileText,  label: 'Applied'  },
  { href: '/profile',      icon: User,      label: 'Profile'  },
];

export function BottomNav() {
  const pathname = usePathname();
  const { isLoggedIn } = useAuthStore();
  const { savedJobIds } = useJobsStore();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#152B20] border-t border-stone-200 dark:border-[#234533] grid grid-cols-4 pb-safe"
      aria-label="Mobile navigation"
    >
      {NAV.map(({ href, icon: Icon, label }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        const showBadge = href === '/applications' && isLoggedIn() && savedJobIds.length > 0;
        return (
          <Link key={href} href={href} className={cn('bottom-nav-item relative', active && 'active')}>
            <div className="relative">
              <Icon className="w-5 h-5" />
              {showBadge && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-700 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {savedJobIds.length > 9 ? '9+' : savedJobIds.length}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
