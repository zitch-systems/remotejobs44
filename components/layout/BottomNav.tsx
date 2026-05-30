'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, BriefcaseBusiness, ClipboardCheck, CircleUserRound, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, useJobsStore } from '@/lib/store';

const NAV = [
  { href: '/',             icon: House,              label: 'Home'     },
  { href: '/jobs',         icon: BriefcaseBusiness,  label: 'Jobs'     },
  { href: '/applications', icon: ClipboardCheck,     label: 'Applied'  },
  { href: '/profile',      icon: CircleUserRound,    label: 'Profile'  },
  { href: '/settings',     icon: Settings,           label: 'Settings' },
];

export function BottomNav() {
  const pathname = usePathname();
  const { isLoggedIn, hydrated } = useAuthStore();
  const { savedJobIds } = useJobsStore();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#0d1a2e] border-t border-stone-200 dark:border-[#1e3a5f] grid grid-cols-5 pb-safe"
      aria-label="Mobile navigation"
    >
      {NAV.map(({ href, icon: Icon, label }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        // Gate the badge on `hydrated` so the SSR pass (where Zustand
        // persist hasn't run yet) and the first client paint produce
        // the same HTML. Without this the badge text-node count
        // differed between server (no badge) and client-after-persist
        // (with badge), tripping React #418 on every page load.
        const showBadge = hydrated
          && href === '/applications'
          && isLoggedIn()
          && savedJobIds.length > 0;
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
