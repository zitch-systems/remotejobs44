'use client';
// components/layout/Header.tsx
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Menu, X, Briefcase, LogOut, User, LayoutDashboard, ClipboardList, Settings } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore, useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/jobs',    label: 'Jobs'    },
  { href: '/pricing', label: 'Pricing' },
];

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function Header() {
  const pathname  = usePathname();
  const router    = useRouter();
  const supabase  = createClient();
  const { theme, setTheme } = useTheme();
  const [mounted,   setMounted]   = useState(false);
  const [scrolled,  setScrolled]  = useState(false);
  const [userOpen,  setUserOpen]  = useState(false);
  const { mobileMenuOpen, setMobileMenuOpen } = useUIStore();
  const { user, isLoggedIn, isAdmin, setUser } = useAuthStore();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => { setMobileMenuOpen(false); }, [pathname]);

  // Sync Supabase session → store on mount
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        setUser({
          id:    session.user.id,
          email: session.user.email!,
          name:  profile?.name ?? session.user.email!.split('@')[0],
          plan:  profile?.plan  ?? 'free',
          role:  profile?.role  ?? 'user',
          joinedAt: profile?.created_at ?? new Date().toISOString(),
          profileCompletion: profile?.profile_completion ?? 20,
        });
      }
    });

    // Listen for auth changes (login/logout in other tabs)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        setUser({
          id:    session.user.id,
          email: session.user.email!,
          name:  profile?.name ?? session.user.email!.split('@')[0],
          plan:  profile?.plan  ?? 'free',
          role:  profile?.role  ?? 'user',
          joinedAt: profile?.created_at ?? new Date().toISOString(),
          profileCompletion: profile?.profile_completion ?? 20,
        });
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setUserOpen(false);
    router.push('/');
  }

  const planLabel = user?.plan === 'daily' ? 'Day Pass ☀️' : user?.plan === 'pro' ? 'Pro ⭐' : user?.plan === 'admin' ? 'Admin 🔧' : 'Free';
  const planColor = user?.plan === 'free' ? 'bg-stone-100 dark:bg-stone-800 text-stone-500' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';

  return (
    <header className={cn(
      'fixed top-0 left-0 right-0 z-50 h-[68px] glass-nav border-b transition-shadow duration-200',
      'border-stone-200/70 dark:border-[#234533]/70',
      scrolled && 'shadow-sm shadow-black/5'
    )}>
      <div className="max-w-[1240px] mx-auto px-5 h-full flex items-center gap-6">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-display font-bold text-[17px] tracking-tight text-stone-900 dark:text-stone-100 hover:opacity-80 transition-opacity shrink-0">
          <svg viewBox="0 0 32 32" className="w-7 h-7 text-brand-700 dark:text-brand-400" fill="none">
            <circle cx="16" cy="16" r="14" fill="currentColor" opacity="0.12"/>
            <path d="M8 20 Q12 10 16 16 Q20 22 24 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <circle cx="24" cy="12" r="3" fill="currentColor"/>
          </svg>
          RemoteJobs44
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-0.5 ml-4">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href} className={cn(
              'px-3 py-2 rounded-md text-sm font-medium transition-colors',
              pathname.startsWith(link.href)
                ? 'text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-[#1C3829]'
            )}>
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2 ml-auto">

          {/* Theme toggle */}
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
              className="w-9 h-9 flex items-center justify-center rounded-md border border-stone-200 dark:border-[#234533] text-stone-500 hover:bg-stone-100 dark:hover:bg-[#1C3829] transition-all"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}

          {/* User menu / Auth buttons */}
          {isLoggedIn() ? (
            <div className="relative hidden md:block">
              <button
                onClick={() => setUserOpen(o => !o)}
                className="w-9 h-9 rounded-full bg-brand-700 dark:bg-brand-500 text-white text-xs font-bold flex items-center justify-center hover:scale-105 transition-transform ring-0 hover:ring-2 ring-brand-200"
              >
                {getInitials(user?.name ?? user?.email ?? 'U')}
              </button>

              {userOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-[#152B20] border border-stone-200 dark:border-[#234533] rounded-xl shadow-xl overflow-hidden z-50">
                  {/* Profile header */}
                  <div className="flex items-center gap-3 p-4 bg-stone-50 dark:bg-[#1C3829] border-b border-stone-100 dark:border-[#234533]">
                    <div className="w-10 h-10 rounded-full bg-brand-700 text-white text-sm font-bold flex items-center justify-center shrink-0">
                      {getInitials(user?.name ?? user?.email ?? 'U')}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{user?.name}</p>
                      <p className="text-xs text-stone-400 truncate">{user?.email}</p>
                      <span className={cn('inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', planColor)}>
                        {planLabel}
                      </span>
                    </div>
                  </div>

                  {/* Links */}
                  <ul className="py-1.5">
                    {[
                      { href: '/dashboard',    icon: <LayoutDashboard className="w-4 h-4" />, label: 'Dashboard' },
                      { href: '/applications', icon: <ClipboardList className="w-4 h-4" />,  label: 'My Applications' },
                      { href: '/profile',      icon: <User className="w-4 h-4" />,            label: 'Profile' },
                      { href: '/pricing',      icon: <Briefcase className="w-4 h-4" />,       label: 'Upgrade Plan' },
                      ...(isAdmin() ? [{ href: '/admin', icon: <Settings className="w-4 h-4" />, label: 'Admin Panel' }] : []),
                    ].map(item => (
                      <li key={item.href}>
                        <Link href={item.href} onClick={() => setUserOpen(false)}
                          className="flex items-center gap-3 px-4 py-2 text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#1C3829] hover:text-stone-900 dark:hover:text-stone-100 transition-colors">
                          <span className="text-stone-400">{item.icon}</span>
                          {item.label}
                        </Link>
                      </li>
                    ))}
                    <li className="border-t border-stone-100 dark:border-[#234533] mt-1 pt-1">
                      <button onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                        <LogOut className="w-4 h-4" /> Log Out
                      </button>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Link href="/login"
                className="px-4 py-2 text-sm font-semibold text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-[#234533] rounded-md hover:bg-stone-50 dark:hover:bg-[#1C3829] transition-all">
                Log in
              </Link>
              <Link href="/register"
                className="px-4 py-2 text-sm font-semibold bg-brand-700 dark:bg-brand-500 text-white rounded-md hover:bg-brand-600 transition-colors shadow-sm">
                Get Started
              </Link>
            </div>
          )}

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            className="md:hidden w-9 h-9 flex flex-col items-center justify-center gap-[5px] rounded-md border border-stone-200 dark:border-[#234533] hover:bg-stone-100 dark:hover:bg-[#1C3829] transition-colors"
          >
            <span className={cn('block w-4 h-[1.5px] bg-stone-600 dark:bg-stone-300 rounded-full transition-transform duration-200', mobileMenuOpen && 'translate-y-[6.5px] rotate-45')} />
            <span className={cn('block w-4 h-[1.5px] bg-stone-600 dark:bg-stone-300 rounded-full transition-opacity duration-200', mobileMenuOpen && 'opacity-0')} />
            <span className={cn('block w-4 h-[1.5px] bg-stone-600 dark:bg-stone-300 rounded-full transition-transform duration-200', mobileMenuOpen && '-translate-y-[6.5px] -rotate-45')} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={cn(
        'md:hidden fixed top-[68px] left-0 right-0 z-40 bg-white dark:bg-[#152B20] border-b border-stone-200 dark:border-[#234533] shadow-lg transition-all duration-300 overflow-hidden',
        mobileMenuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
      )}>
        <div className="p-4 space-y-1">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href}
              className={cn('block px-4 py-3 rounded-lg text-base font-medium transition-colors',
                pathname.startsWith(link.href) ? 'text-brand-700 bg-brand-50' : 'text-stone-600 hover:bg-stone-50'
              )}>
              {link.label}
            </Link>
          ))}
        </div>
        <div className="px-4 pb-4 flex gap-3">
          {isLoggedIn() ? (
            <>
              <Link href="/dashboard" className="flex-1 py-2.5 text-center text-sm font-semibold border border-stone-200 dark:border-[#234533] rounded-lg">Dashboard</Link>
              <button onClick={handleLogout} className="flex-1 py-2.5 text-sm font-semibold bg-brand-700 text-white rounded-lg">Log Out</button>
            </>
          ) : (
            <>
              <Link href="/login"    className="flex-1 py-2.5 text-center text-sm font-semibold border border-stone-200 dark:border-[#234533] rounded-lg">Log in</Link>
              <Link href="/register" className="flex-1 py-2.5 text-center text-sm font-semibold bg-brand-700 text-white rounded-lg">Get Started</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
