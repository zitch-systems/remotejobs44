'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, LogOut, User, LayoutDashboard, ClipboardList, Settings, Briefcase, Zap, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore, useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/jobs',      label: 'Jobs'      },
  { href: '/companies', label: 'Companies' },
  { href: '/pricing',   label: 'Pricing'   },
  { href: '/about',     label: 'About'     },
];

function getInitials(name: string) {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function Header() {
  const pathname = usePathname();
  const router   = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted,   setMounted]   = useState(false);
  const [scrolled,  setScrolled]  = useState(false);
  const [userOpen,  setUserOpen]  = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  const { mobileMenuOpen, setMobileMenuOpen } = useUIStore();
  const { user, isLoggedIn, isAdmin, setUser } = useAuthStore();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => { setMobileMenuOpen(false); }, [pathname]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sync auth from Supabase on every mount — fixes refresh losing login state
  useEffect(() => {
    const supabase = createClient();

    async function fetchProfile(userId: string, email: string) {
      try {
        const profilePromise = supabase
          .from('profiles').select('name,plan,role,created_at,profile_completion')
          .eq('id', userId).maybeSingle();
        const timeoutPromise = new Promise<null>(res => setTimeout(() => res(null), 5000));
        const result = await Promise.race([profilePromise, timeoutPromise]);
        const profile = (result && 'data' in result) ? result.data : null;
        return profile;
      } catch { return null; }
    }

    async function syncAuth() {
      try {
        // getUser() validates with Supabase server — always returns the live auth state
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { setUser(null); return; }
        const profile = await fetchProfile(authUser.id, authUser.email!);
        setUser({
          id:    authUser.id,
          email: authUser.email!,
          name:  profile?.name ?? authUser.email!.split('@')[0],
          plan:  profile?.plan ?? 'free',
          role:  profile?.role ?? 'user',
          joinedAt: profile?.created_at ?? new Date().toISOString(),
          profileCompletion: profile?.profile_completion ?? 20,
        });
      } catch { setUser(null); }
    }

    syncAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) { setUser(null); return; }
      if (event === 'SIGNED_IN' && session.user) {
        const profile = await fetchProfile(session.user.id, session.user.email!);
        setUser({
          id:    session.user.id,
          email: session.user.email!,
          name:  profile?.name ?? session.user.email!.split('@')[0],
          plan:  profile?.plan ?? 'free',
          role:  profile?.role ?? 'user',
          joinedAt: profile?.created_at ?? new Date().toISOString(),
          profileCompletion: profile?.profile_completion ?? 20,
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    // Clear local state first so UI responds instantly
    setUser(null);
    setUserOpen(false);
    try { localStorage.removeItem('rj44-auth'); localStorage.removeItem('rj44-jobs'); } catch {}
    // Sign out from Supabase — wrapped so navigation always happens even if request fails
    try { await createClient().auth.signOut(); } catch {}
    window.location.replace('/');
  }

  const planLabel = user?.plan === 'daily' ? 'Day Pass' :
                    user?.plan === 'pro'   ? 'Pro' :
                    user?.plan === 'admin' ? 'Admin' : 'Free';
  const planColor = user?.plan === 'free'
    ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
    : 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400';

  return (
    <header className={cn(
      'fixed top-0 left-0 right-0 z-50 h-[68px] glass-nav border-b transition-shadow duration-200',
      'border-stone-200/70 dark:border-[#1e3a5f]/70',
      scrolled && 'shadow-sm shadow-black/5'
    )}>
      <div className="max-w-[1240px] mx-auto px-4 sm:px-5 h-full flex items-center gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 font-display font-bold text-[17px] tracking-tight text-slate-900 dark:text-slate-100 hover:opacity-80 transition-opacity shrink-0">
          <svg viewBox="0 0 40 40" className="w-9 h-9" fill="none">
            <rect width="40" height="40" rx="10" fill="#2563eb"/>
            <path d="M10 26 Q15 12 20 20 Q25 28 29 15" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none"/>
            <circle cx="29" cy="15" r="3.5" fill="#f97316"/>
          </svg>
          RemoteJobs44
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-0.5 ml-2">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href} className={cn(
              'px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150',
              pathname.startsWith(link.href)
                ? 'text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-[#0a1628]'
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
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#1e3a5f] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#0a1628] transition-all"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          )}

          {/* Auth */}
          {mounted && (
            isLoggedIn() ? (
              <div ref={userRef} className="relative hidden md:block">
                <button
                  onClick={() => setUserOpen(o => !o)}
                  className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-stone-100 dark:hover:bg-[#0a1628] transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-brand-700 dark:bg-brand-600 text-white text-xs font-bold flex items-center justify-center">
                    {getInitials(user?.name ?? user?.email ?? 'U')}
                  </div>
                  <ChevronDown className={cn('w-3.5 h-3.5 text-stone-400 transition-transform', userOpen && 'rotate-180')} />
                </button>

                {userOpen && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-xl shadow-xl overflow-hidden z-50 animate-fade-in">
                    {/* Profile header */}
                    <div className="flex items-center gap-3 p-4 border-b border-stone-100 dark:border-[#1e3a5f] bg-stone-50 dark:bg-[#0f1e38]">
                      <div className="w-10 h-10 rounded-full bg-brand-700 dark:bg-brand-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                        {getInitials(user?.name ?? user?.email ?? 'U')}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{user?.name}</p>
                        <p className="text-xs text-stone-400 truncate">{user?.email}</p>
                        <span className={cn('inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold', planColor)}>
                          {planLabel}
                        </span>
                      </div>
                    </div>

                    {/* Upgrade nudge for free users */}
                    {user?.plan === 'free' && (
                      <Link href="/pricing" onClick={() => setUserOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-brand-50 dark:bg-brand-900/20 border-b border-stone-100 dark:border-[#1e3a5f] text-sm text-brand-700 dark:text-brand-400 font-semibold hover:bg-brand-100 dark:hover:bg-brand-900/30 transition-colors">
                        <Zap className="w-4 h-4" />
                        Upgrade from ₦1,000 →
                      </Link>
                    )}

                    <ul className="py-1.5">
                      {[
                        { href: '/dashboard',    icon: <LayoutDashboard className="w-4 h-4"/>, label: 'Dashboard'       },
                        { href: '/applications', icon: <ClipboardList className="w-4 h-4"/>,  label: 'My Applications'  },
                        { href: '/profile',      icon: <User className="w-4 h-4"/>,            label: 'Profile & CV'     },
                        { href: '/pricing',      icon: <Briefcase className="w-4 h-4"/>,       label: 'Plans'            },
                        ...(isAdmin() ? [{ href: '/admin', icon: <Settings className="w-4 h-4"/>, label: 'Admin Panel' }] : []),
                      ].map(item => (
                        <li key={item.href}>
                          <Link href={item.href} onClick={() => setUserOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#0f1e38] hover:text-stone-900 dark:hover:text-stone-100 transition-colors">
                            <span className="text-stone-400">{item.icon}</span>
                            {item.label}
                          </Link>
                        </li>
                      ))}
                      <li className="border-t border-stone-100 dark:border-[#1e3a5f] mt-1 pt-1">
                        <button onClick={handleLogout}
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
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
                  className="px-4 py-2 text-sm font-semibold text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-[#1e3a5f] rounded-lg hover:bg-stone-50 dark:hover:bg-[#0a1628] transition-all">
                  Log in
                </Link>
                <Link href="/register"
                  className="px-4 py-2 text-sm font-semibold bg-brand-700 dark:bg-brand-600 text-white rounded-lg hover:bg-brand-800 transition-colors shadow-sm">
                  Get Started
                </Link>
              </div>
            )
          )}

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            className="md:hidden w-9 h-9 flex flex-col items-center justify-center gap-[5px] rounded-lg border border-stone-200 dark:border-[#1e3a5f] hover:bg-stone-100 dark:hover:bg-[#0a1628] transition-colors"
          >
            <span className={cn('block w-4 h-[1.5px] bg-stone-600 dark:bg-stone-300 rounded-full transition-all duration-200', mobileMenuOpen && 'translate-y-[6.5px] rotate-45')} />
            <span className={cn('block w-4 h-[1.5px] bg-stone-600 dark:bg-stone-300 rounded-full transition-all duration-200', mobileMenuOpen && 'opacity-0')} />
            <span className={cn('block w-4 h-[1.5px] bg-stone-600 dark:bg-stone-300 rounded-full transition-all duration-200', mobileMenuOpen && '-translate-y-[6.5px] -rotate-45')} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={cn(
        'md:hidden fixed top-[68px] left-0 right-0 z-40 bg-white dark:bg-[#0a1628] border-b border-stone-200 dark:border-[#1e3a5f] shadow-lg transition-all duration-300 overflow-hidden',
        mobileMenuOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
      )}>
        <div className="p-4 space-y-1">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href}
              className={cn('block px-4 py-3 rounded-xl text-base font-medium transition-colors',
                pathname.startsWith(link.href)
                  ? 'text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#0f1e38]'
              )}>
              {link.label}
            </Link>
          ))}
        </div>
        <div className="px-4 pb-4 flex gap-2">
          {isLoggedIn() ? (
            <>
              <Link href="/dashboard" className="flex-1 py-2.5 text-center text-sm font-semibold border border-stone-200 dark:border-[#1e3a5f] rounded-xl hover:bg-stone-50 dark:hover:bg-[#0f1e38] transition-colors text-stone-700 dark:text-stone-300">
                Dashboard
              </Link>
              <button onClick={handleLogout} className="flex-1 py-2.5 text-sm font-semibold bg-brand-700 dark:bg-brand-600 text-white rounded-xl hover:bg-brand-800 transition-colors">
                Log Out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="flex-1 py-2.5 text-center text-sm font-semibold border border-stone-200 dark:border-[#1e3a5f] rounded-xl hover:bg-stone-50 dark:hover:bg-[#0f1e38] transition-colors text-stone-700 dark:text-stone-300">
                Log in
              </Link>
              <Link href="/register" className="flex-1 py-2.5 text-center text-sm font-semibold bg-brand-700 dark:bg-brand-600 text-white rounded-xl hover:bg-brand-800 transition-colors">
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
