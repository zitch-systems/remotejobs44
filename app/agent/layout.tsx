'use client';
// app/agent/layout.tsx — gate for the agent referral portal.
//
// Access is by ROLE, not subscription: any user whose profiles.role is
// 'agent' gets in, regardless of their own plan. Mirrors the optimistic-
// then-verified pattern of app/admin/layout.tsx — render instantly when the
// persisted session already looks like an agent, then confirm against the
// live session in the background and bounce if the guess was wrong. Every
// /api/agent/* route independently enforces requireAgent, so this layout is
// UX, not the security boundary.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Megaphone, LogOut } from 'lucide-react';
import { createClient, getAuthedUserSafe } from '@/lib/supabase/client';
import { resolveRole } from '@/lib/auth/redirect';
import { useAuthStore } from '@/lib/store';

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const persistedUser = useAuthStore(s => s.user);
  const persistedAgent = persistedUser?.role === 'agent';

  const [verifiedReady, setVerifiedReady] = useState(false);
  const ready = persistedAgent || verifiedReady;
  const agentName = persistedUser?.name ?? persistedUser?.email?.split('@')[0] ?? 'Agent';

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    async function check() {
      const supabase = createClient();
      const { user, status } = await getAuthedUserSafe(supabase);
      if (cancelled) return;
      if (status === 'unauthed') { router.replace('/login?next=/agent'); return; }
      if (status === 'transient') {
        retryTimer = setTimeout(() => { if (!cancelled) check(); }, 2000);
        return;
      }
      if (!user) { router.replace('/login?next=/agent'); return; }

      let profile: { role?: string } | null = null;
      try {
        const queryPromise = supabase
          .from('profiles').select('role').eq('id', user.id).maybeSingle()
          .then(({ data }) => data);
        const timeoutPromise = new Promise<null>(res => setTimeout(() => res(null), 5000));
        profile = await Promise.race([queryPromise, timeoutPromise]);
      } catch {}
      if (cancelled) return;

      // A failed/timed-out fetch is NOT proof of non-agent. If the persisted
      // session says agent, render and let /api/agent/* enforce — don't bounce
      // a real agent to /dashboard on a transient blip.
      if (!profile) {
        if (useAuthStore.getState().user?.role === 'agent') { setVerifiedReady(true); return; }
        router.replace('/dashboard');
        return;
      }

      const role = resolveRole({ profileRole: profile.role, email: user.email });
      if (role === 'agent') { setVerifiedReady(true); return; }
      if (role === 'admin') { router.replace('/admin'); return; }
      router.replace('/dashboard');
    }
    check();
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, [router]);

  async function handleLogout() {
    const supabase = createClient();
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('sb-') || k.startsWith('supabase') || k.startsWith('rj44')) {
          localStorage.removeItem(k);
        }
      });
    } catch {}
    await supabase.auth.signOut();
    window.location.replace('/login');
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8faff] dark:bg-[#0f1e38]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full animate-spin"
            style={{ border: '3px solid #bfdbfe', borderTopColor: '#2563eb' }} />
          <p className="text-sm text-slate-400">Verifying access…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8faff] dark:bg-[#0f1e38]">
      <div className="border-b border-slate-200 dark:border-[#1e2d4a] bg-white dark:bg-[#0a1628]">
        <div className="max-w-[1100px] mx-auto px-5 h-16 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#2563eb' }}>
            <Megaphone className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#2563eb' }}>Agent Portal</p>
            <p className="text-xs text-slate-400 truncate">{agentName}</p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/" className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-50 dark:hover:bg-[#111c35] transition-colors">
              ← Back to site
            </Link>
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
              <LogOut className="w-3.5 h-3.5" /> Log out
            </button>
          </div>
        </div>
      </div>
      <main className="max-w-[1100px] mx-auto px-5 py-8">{children}</main>
    </div>
  );
}
