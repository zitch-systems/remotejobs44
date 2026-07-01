'use client';
// components/member/MemberShell.tsx
//
// The signed-in chrome: a sticky top bar (brand · global search · theme
// toggle · notification bell · user) and a left sidebar nav. Wraps every
// route under app/(member)/. Mirrors components/layout/Header for theme +
// sign-out behaviour so the two shells stay consistent.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useTheme } from 'next-themes';
import {
  LayoutGrid, Search, Bookmark, ClipboardList, FileText, FileSignature,
  Video, BarChart3, User, Bell, Settings, LogOut, Sun, Moon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore, useJobsStore } from '@/lib/store';
import { getUnreadCount, ALERTS_CHANGED_EVENT } from '@/lib/member/alerts';

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  badge?: number;
};

function getInitials(name: string) {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Brand glyph — the squiggle + orange dot, matching the design files. */
function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" style={{ width: 30, height: 30 }} aria-hidden="true">
      <defs>
        <linearGradient id="rj-member-lg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1e3a5f" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#rj-member-lg)" />
      <path d="M8 20 Q12 10 16 16 Q20 22 23 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="23" cy="12" r="2.5" fill="#f97316" />
    </svg>
  );
}

export function MemberShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { user } = useAuthStore();
  const { applications, savedJobIds } = useJobsStore();

  const [mounted, setMounted] = useState(false);
  const [unread, setUnread] = useState(0);
  const [query, setQuery] = useState('');

  useEffect(() => { setMounted(true); }, []);

  // Keep the bell / sidebar badge in sync with the Alerts page's read state.
  useEffect(() => {
    const sync = () => setUnread(getUnreadCount());
    sync();
    window.addEventListener(ALERTS_CHANGED_EVENT, sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener(ALERTS_CHANGED_EVENT, sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  async function handleLogout() {
    useAuthStore.getState().setUser(null);
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('sb-') || k.startsWith('supabase') || k.startsWith('rj44')) {
          localStorage.removeItem(k);
        }
      });
    } catch { /* ignore */ }
    try { await createClient().auth.signOut(); } catch { /* ignore */ }
    window.location.replace('/login');
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/jobs?q=${encodeURIComponent(q)}` : '/jobs');
  }

  const appsCount = applications.length;
  const savedCount = savedJobIds.length;

  const menu: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
    { href: '/jobs', label: 'Browse Jobs', icon: Search },
    { href: '/saved', label: 'Saved Jobs', icon: Bookmark, badge: savedCount || undefined },
    { href: '/applications', label: 'Applications', icon: ClipboardList, badge: appsCount || undefined },
  ];
  const tools: NavItem[] = [
    { href: '/cv', label: 'CV Builder', icon: FileText },
    { href: '/cover-letters', label: 'Cover Letters', icon: FileSignature },
    { href: '/interview', label: 'AI Interview', icon: Video },
    { href: '/match', label: 'Job Match', icon: BarChart3 },
  ];
  const account: NavItem[] = [
    { href: '/profile', label: 'Profile', icon: User },
    { href: '/alerts', label: 'Alerts', icon: Bell, badge: unread || undefined },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  const isActive = (href: string) =>
    pathname === href || (href !== '/jobs' && pathname.startsWith(href + '/'));

  const renderNav = (items: NavItem[]) =>
    items.map(({ href, label, icon: Icon, badge }) => (
      <Link key={href} href={href} className={`nav-item${isActive(href) ? ' active' : ''}`}>
        <Icon />
        <span>{label}</span>
        {badge != null && <span className="nbadge">{badge}</span>}
      </Link>
    ));

  const displayName = user?.name || user?.email || 'Member';

  return (
    <div className="member-shell">
      <header className="member-topbar">
        <Link href="/dashboard" className="member-brand">
          <BrandMark />
          <b>RemoteJobs<span>44</span></b>
        </Link>

        <form className="member-topsearch" onSubmit={onSearch} role="search">
          <div className="member-search-box">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search remote jobs…"
              aria-label="Search remote jobs"
            />
          </div>
        </form>

        <div className="member-topright">
          {mounted && (
            <button
              type="button"
              className="tb-ico"
              aria-label="Toggle dark mode"
              aria-pressed={theme === 'dark'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </button>
          )}
          <Link href="/alerts" className="tb-ico" aria-label={`Alerts${unread ? `, ${unread} unread` : ''}`}>
            <Bell />
            {mounted && unread > 0 && <span className="tb-badge">{unread}</span>}
          </Link>
          <span className="tb-name">{user?.name || 'Member'}</span>
          {user?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="tb-avatar" src={user.avatar} alt={displayName} width={34} height={34} />
          ) : (
            <Link href="/profile" className="tb-avatar-fallback" aria-label="Your profile">
              {getInitials(displayName)}
            </Link>
          )}
        </div>
      </header>

      <div className="member-body">
        <nav className="member-sidebar" aria-label="Member navigation">
          <div className="nav-label">Menu</div>
          {renderNav(menu)}
          <div className="nav-label">Tools</div>
          {renderNav(tools)}
          <div className="nav-label">Account</div>
          {renderNav(account)}
          <div className="member-sidebar-footer">
            <button type="button" className="nav-item" onClick={handleLogout}>
              <LogOut />
              <span>Sign out</span>
            </button>
          </div>
        </nav>

        <div className="member-content">{children}</div>
      </div>
    </div>
  );
}
