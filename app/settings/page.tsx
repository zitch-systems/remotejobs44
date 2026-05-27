'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Settings as SettingsIcon, CreditCard, Bell, User, FileText, LogOut,
  Trash2, Moon, Sun, Shield, ChevronRight, Mail,
} from 'lucide-react';
import { createClient, getAuthedUserSafe } from '@/lib/supabase/client';
import { useAuthStore, useUIStore } from '@/lib/store';

// /settings — central hub for account / billing / preferences.
// Separate from /profile (which is about identity: name, CV, AI review)
// so users can find billing, email prefs, theme, and delete-account in
// one consistent place. Listed alongside Profile in the bottom nav and
// the Header dropdown.

function SettingsContent() {
  const router = useRouter();
  const supabase = createClient();
  const { user } = useAuthStore();
  const logoutStore = useAuthStore(s => s.logout);
  const { toast } = useUIStore();

  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    let cancelled = false;
    // Failsafe: render after 10s even if the auth check stalls.
    const failsafe = setTimeout(() => { if (!cancelled) setLoading(false); }, 10000);
    (async () => {
      // 8s timeout so a throttled function can't stall the page.
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch('/api/profile', { signal: ctrl.signal });
        clearTimeout(t);
        if (cancelled) return;
        if (res.status === 401 && !useAuthStore.getState().user) {
          router.replace('/login?next=/settings');
          return;
        }
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    if (typeof document !== 'undefined') {
      setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    }
    return () => { cancelled = true; clearTimeout(failsafe); };
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', next === 'dark');
      try { localStorage.setItem('rj44-theme', next); } catch {}
    }
  }

  async function handleLogout() {
    logoutStore();
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('sb-') || k.startsWith('supabase')) localStorage.removeItem(k);
      });
    } catch {}
    try { await supabase.auth.signOut(); } catch {}
    window.location.replace('/');
  }

  if (loading) return (
    <div className="max-w-[700px] mx-auto px-5 py-10 animate-pulse space-y-4">
      <div className="skeleton h-8 w-48 rounded" />
      <div className="skeleton h-48 rounded-lg" />
    </div>
  );

  if (!user) return (
    <div className="max-w-[500px] mx-auto px-5 py-20 text-center">
      <p className="text-stone-500 dark:text-stone-400 mb-6">Your session expired. Please sign in to view settings.</p>
      <Link href="/login?next=/settings" className="inline-flex items-center gap-2 px-6 py-3 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-lg hover:bg-brand-600 transition-colors">
        Sign in
      </Link>
    </div>
  );

  const planLabel = user.plan === 'daily' ? 'Day Pass' : user.plan === 'pro' ? 'Pro' : user.plan === 'admin' ? 'Admin' : 'Free';

  return (
    <div className="max-w-[700px] mx-auto px-5 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-700 dark:text-brand-400">
          <SettingsIcon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">Settings</h1>
          <p className="text-xs text-stone-400">Signed in as {user.email}</p>
        </div>
      </div>

      {/* Account section */}
      <div className="card p-5 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Account</h2>
        <Row href="/profile"          icon={<User className="w-4 h-4" />}        title="Profile & CV"      sub="Name, email, CV, AI review" />
        <Row href="/applications"     icon={<FileText className="w-4 h-4" />}     title="My applications"   sub="Track jobs you've applied to" />
      </div>

      {/* Subscription */}
      <div className="card p-5 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Subscription</h2>
        <Row
          href="/profile/billing"
          icon={<CreditCard className="w-4 h-4" />}
          title="Billing & plan"
          sub={`Current: ${planLabel}`}
          highlight={user.plan === 'free'}
        />
        <Row
          href="/profile/billing#emails"
          icon={<Bell className="w-4 h-4" />}
          title="Email preferences"
          sub="Job alerts, product updates, marketing"
        />
        {user.plan === 'free' && (
          <Link href="/pricing"
            className="mt-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors">
            <Shield className="w-4 h-4" /> Upgrade from ₦500
          </Link>
        )}
      </div>

      {/* Appearance */}
      <div className="card p-5 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Appearance</h2>
        <button onClick={toggleTheme}
          className="w-full flex items-center gap-3 p-3 rounded-lg border border-stone-100 dark:border-[#1e3a5f] hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors text-left">
          <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 flex items-center justify-center shrink-0">
            {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-stone-900 dark:text-stone-100">Theme</p>
            <p className="text-xs text-stone-400">Currently {theme === 'dark' ? 'dark' : 'light'} mode — tap to switch</p>
          </div>
          <ChevronRight className="w-4 h-4 text-stone-400" />
        </button>
      </div>

      {/* Support */}
      <div className="card p-5 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Support</h2>
        <a href="mailto:hello@remotejobs44.com"
          className="flex items-center gap-3 p-3 rounded-lg border border-stone-100 dark:border-[#1e3a5f] hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
          <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 flex items-center justify-center shrink-0">
            <Mail className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-stone-900 dark:text-stone-100">Contact us</p>
            <p className="text-xs text-stone-400 truncate">hello@remotejobs44.com</p>
          </div>
          <ChevronRight className="w-4 h-4 text-stone-400" />
        </a>
      </div>

      {/* Sign out */}
      <button onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 mb-4 border border-stone-200 dark:border-[#1e3a5f] rounded-lg text-sm font-bold text-stone-600 dark:text-stone-300 hover:text-red-600 hover:border-red-200 dark:hover:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
        <LogOut className="w-4 h-4" /> Log out
      </button>

      {/* Danger zone */}
      <div className="card p-5 border-red-100 dark:border-red-900/40 bg-red-50/30 dark:bg-red-900/5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 mb-3 flex items-center gap-1.5">
          <Trash2 className="w-3 h-3" /> Danger zone
        </h2>
        <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
          Permanently delete your account, applications, saved jobs, and subscription. Cannot be undone.
        </p>
        <Link href="/profile/billing#delete"
          className="inline-flex items-center gap-2 px-4 py-2 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-sm font-semibold rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
          Delete account
        </Link>
      </div>
    </div>
  );
}

function Row({ href, icon, title, sub, highlight }: {
  href: string; icon: React.ReactNode; title: string; sub: string; highlight?: boolean;
}) {
  return (
    <Link href={href} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors mt-2 first:mt-0 ${
      highlight
        ? 'border-amber-200 dark:border-amber-900/40 hover:bg-amber-50 dark:hover:bg-amber-900/10'
        : 'border-stone-100 dark:border-[#1e3a5f] hover:bg-stone-50 dark:hover:bg-[#162033]'
    }`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
        highlight
          ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
          : 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400'
      }`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-stone-900 dark:text-stone-100">{title}</p>
        <p className="text-xs text-stone-400 dark:text-stone-500 truncate">{sub}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-stone-400" />
    </Link>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="max-w-[700px] mx-auto px-5 py-10 animate-pulse space-y-4">
        <div className="skeleton h-8 w-48 rounded" />
        <div className="skeleton h-48 rounded-lg" />
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
