'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, LogOut, User, LayoutDashboard, ClipboardList, Settings, SlidersHorizontal, Briefcase, Zap, ChevronDown } from 'lucide-react';
import { createClient, getAuthedUserSafe } from '@/lib/supabase/client';
import { useAuthStore, useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { resolveRole } from '@/lib/auth/redirect';

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
  const { user, isLoggedIn, isAdmin, setUser, hydrated } = useAuthStore();

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

  // Sync auth from Supabase on mount — stable session, no random logouts
  useEffect(() => {
    const supabase = createClient();
    let ignoreNextSignedOut = false;

    async function fetchProfile(userId: string) {
      try {
        const queryPromise = supabase
          .from('profiles').select('name,plan,role,created_at,profile_completion,plan_expires_at')
          .eq('id', userId).maybeSingle()
          .then(({ data }: { data: any }) => data);
        const timeoutPromise = new Promise<null>(res => setTimeout(() => res(null), 5000));
        return await Promise.race([queryPromise, timeoutPromise]);
      } catch { return null; }
    }

    function buildUser(authUser: { id: string; email?: string | null }, profile: any) {
      const role = resolveRole({ profileRole: profile?.role, email: authUser.email });

      // Effective plan — mirrors /api/profile so client and server agree.
      // Without this, Header would read profile.plan directly and downgrade
      // a user to 'free' the moment their day-pass webhook lagged by a few
      // hundred ms (the "subscribed → unsubscribed → subscribed back"
      // flicker users were reporting after refresh).
      //
      //   * admin role overrides everything
      //   * plan_expires_at in the past → 'free' (genuine expiry; cron
      //     downgrade lagged but plan is conceptually expired)
      //   * plan_expires_at in the future → the user is paid; trust
      //     profile.plan unless it's 'free' (webhook race during fresh
      //     purchase — keep the higher persisted client plan)
      //   * plan_expires_at null + no profile → 'free'
      const now = Date.now();
      const expiryMs = profile?.plan_expires_at ? new Date(profile.plan_expires_at).getTime() : null;
      const hasFutureExpiry = expiryMs !== null && expiryMs >= now;
      const expired = expiryMs !== null && expiryMs < now;

      let dbPlan: 'free' | 'daily' | 'pro' | 'admin';
      if (role === 'admin')         dbPlan = 'admin';
      else if (expired)             dbPlan = 'free';
      else                          dbPlan = (profile?.plan ?? 'free') as 'free' | 'daily' | 'pro' | 'admin';

      const currentPlan = useAuthStore.getState().user?.plan ?? 'free';
      // Webhook race: profile.plan still says 'free' but plan_expires_at
      // proves the user just paid. Keep whatever non-free plan the client
      // already had (verify route / pricing-success handler set it).
      const plan = (dbPlan === 'free' && hasFutureExpiry && currentPlan !== 'free')
        ? currentPlan
        : dbPlan;

      return {
        id:    authUser.id,
        email: authUser.email!,
        name:  profile?.name ?? authUser.email!.split('@')[0],
        plan,
        role,
        joinedAt: profile?.created_at ?? new Date().toISOString(),
        profileCompletion: profile?.profile_completion ?? 20,
      };
    }

    async function syncAuth() {
      const { setHydrated } = useAuthStore.getState();
      try {
        const { user: authUser, status } = await getAuthedUserSafe(supabase);
        if (status === 'unauthed')  { setUser(null); return; }

        // SECURITY: if the persisted user (from localStorage) is for a
        // different person than the live Supabase session, wipe it. ONLY
        // wipe here when we're about to return without a follow-up
        // setUser — otherwise the next setUser(buildUser(...)) below
        // overwrites atomically (setUser already wipes the jobs store on
        // user-id change via resetJobsStoreForNewUser). Calling
        // setUser(null) before setUser(buildUser) caused a one-frame
        // logged-out flash visible in components subscribed to `user`.
        const persisted = useAuthStore.getState().user;
        const crossAccount = !!(authUser && persisted && persisted.id !== authUser.id);

        if (status === 'transient') {
          // Server couldn't validate. If persisted matches the (possibly
          // stale) authUser id we keep showing the persisted state. If
          // it doesn't, wipe now (no follow-up setUser this turn).
          if (crossAccount) setUser(null);
          setHydrated(true);
          return;
        }
        if (!authUser) { setUser(null); return; }

        const profile = await fetchProfile(authUser.id);
        if (!profile) {
          // Profile fetch returned null. Two distinct cases:
          //   (a) Fetch timed out / errored (5s cap in fetchProfile). Common
          //       on mobile / cold lambda. If Zustand already has a user
          //       for THIS authUser.id, the persisted plan is more reliable
          //       than a freshly-built skeleton — DO NOT call setUser, just
          //       mark hydrated. Otherwise the persisted 'daily' / 'pro'
          //       gets clobbered to 'free' for the rest of the session.
          //       This was the "Subscribe-button flash after payment" bug.
          //   (b) Cold load, no row yet (fresh Google OAuth, etc.) — write
          //       a skeleton from authUser so downstream code has a user.
          const stillPersisted = useAuthStore.getState().user;
          if (stillPersisted && stillPersisted.id === authUser.id) {
            setHydrated(true);
            return;
          }
          setUser(buildUser(authUser, null));
          return;
        }
        setUser(buildUser(authUser, profile));
      } catch {
        setHydrated(true);
      }
    }

    syncAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        ignoreNextSignedOut = true;
        setTimeout(() => { ignoreNextSignedOut = false; }, 3000);
        if (session?.user) {
          const profile = await fetchProfile(session.user.id);
          // Same guard as syncAuth: if profile fetch failed but Zustand
          // already has a paid user for THIS id, keep the persisted plan
          // rather than overwriting with a plan='free' skeleton.
          if (!profile) {
            const stillPersisted = useAuthStore.getState().user;
            if (stillPersisted && stillPersisted.id === session.user.id) return;
          }
          setUser(buildUser(session.user, profile));
        }
        return;
      }
      if (event === 'SIGNED_OUT') {
        // Do NOT auto-logout from the auth event listener. Supabase can
        // fire SIGNED_OUT during a brief token-refresh race after a normal
        // API call (e.g., right after submitting an application), and a
        // single getUser() check at that moment may legitimately return
        // 401 even though the session is about to recover via the next
        // TOKEN_REFRESHED event.
        //
        // The user's own logout buttons (Header / dashboard / profile)
        // explicitly call setUser(null) + signOut() + redirect — those
        // are the only places that should drop local state. Cross-tab
        // logouts will reconcile on the next page load via syncAuth.
        if (ignoreNextSignedOut) return;
        // Wait a moment for any in-flight TOKEN_REFRESHED to land. If
        // session is genuinely gone AND no auth cookie remains, then
        // log out — otherwise keep state and let the next syncAuth /
        // page nav resolve.
        await new Promise(r => setTimeout(r, 2500));
        const { data: { session: stillSession } } = await supabase.auth.getSession();
        if (stillSession?.user) return; // recovered
        // Final defense: keep persisted state if any sb-* cookie still
        // exists in document.cookie — only log out when storage is
        // truly empty.
        if (typeof document !== 'undefined' && /(?:^|;\s*)sb-[^=]+-auth-token/.test(document.cookie)) {
          return;
        }
        setUser(null);
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
        // Same 3s guard as TOKEN_REFRESHED — Supabase v2 can emit a
        // transient SIGNED_OUT immediately after a fresh SIGNED_IN on
        // flaky connections, and the SIGNED_OUT handler's 2.5s wait
        // + cookie regex isn't sufficient on Safari ITP. Suppress the
        // next SIGNED_OUT for 3s so a sign-in event can't be cancelled
        // out by a spurious sign-out right after it.
        ignoreNextSignedOut = true;
        setTimeout(() => { ignoreNextSignedOut = false; }, 3000);
        const profile = await fetchProfile(session.user.id);
        if (!profile) {
          const stillPersisted = useAuthStore.getState().user;
          if (stillPersisted && stillPersisted.id === session.user.id) return;
        }
        setUser(buildUser(session.user, profile));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    setUser(null);
    setUserOpen(false);
    // Clear ALL persisted auth — Zustand + Supabase session tokens
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('sb-') || k.startsWith('supabase') || k.startsWith('rj44')) {
          localStorage.removeItem(k);
        }
      });
    } catch {}
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
      <div className="max-w-[1440px] mx-auto px-4 sm:px-5 h-full flex items-center gap-4">

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
                        {hydrated && (
                          <span className={cn('inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold', planColor)}>
                            {planLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Upgrade nudge for free users */}
                    {user?.plan === 'free' && (
                      <Link href="/pricing" onClick={() => setUserOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-brand-50 dark:bg-brand-900/20 border-b border-stone-100 dark:border-[#1e3a5f] text-sm text-brand-700 dark:text-brand-400 font-semibold hover:bg-brand-100 dark:hover:bg-brand-900/30 transition-colors">
                        <Zap className="w-4 h-4" />
                        Upgrade from ₦500 →
                      </Link>
                    )}

                    <ul className="py-1.5">
                      {[
                        { href: '/dashboard',    icon: <LayoutDashboard className="w-4 h-4"/>, label: 'Dashboard'       },
                        { href: '/applications', icon: <ClipboardList className="w-4 h-4"/>,  label: 'My Applications'  },
                        { href: '/profile',      icon: <User className="w-4 h-4"/>,            label: 'Profile & CV'     },
                        { href: '/settings',     icon: <SlidersHorizontal className="w-4 h-4"/>, label: 'Settings'        },
                        { href: '/pricing',      icon: <Briefcase className="w-4 h-4"/>,       label: 'Plans'            },
                        // Only render Admin link when we've confirmed the live
                        // session role — otherwise persisted state from a
                        // previous admin login can briefly flash this link to a
                        // regular member, confusing the user.
                        ...(hydrated && isAdmin() ? [{ href: '/admin', icon: <Settings className="w-4 h-4"/>, label: 'Admin Panel' }] : []),
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
          {mounted && isLoggedIn() ? (
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
