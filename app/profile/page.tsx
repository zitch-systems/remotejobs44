'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Mail, Save, Zap, Shield, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore, useUIStore } from '@/lib/store';

function ProfileContent() {
  const router   = useRouter();
  const supabase = createClient();
  const { user, setUser, isPro } = useAuthStore();
  const { toast } = useUIStore();

  const [name,    setName]    = useState('');
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login?next=/profile'); return; }
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (profile) {
        setUser({ id: session.user.id, email: session.user.email!, name: profile.name ?? '', plan: profile.plan ?? 'free', role: profile.role ?? 'user', joinedAt: profile.created_at, profileCompletion: profile.profile_completion ?? 20 });
        setName(profile.name ?? '');
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ name }).eq('id', user.id);
    if (error) toast(error.message, 'error');
    else { setUser({ ...user, name }); toast('Profile updated ✅', 'success'); }
    setSaving(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    router.push('/');
  }

  if (loading) return <div className="max-w-[600px] mx-auto px-5 py-10 animate-pulse"><div className="skeleton h-8 w-48 rounded mb-6" /><div className="skeleton h-64 rounded-lg" /></div>;

  const planLabel = user?.plan === 'daily' ? 'Day Pass ☀️' : user?.plan === 'pro' ? 'Pro ⭐' : user?.plan === 'admin' ? 'Admin 🔧' : 'Free';
  const planColor = user?.plan === 'free' ? 'bg-stone-100 dark:bg-stone-800 text-stone-500' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';

  return (
    <div className="max-w-[600px] mx-auto px-5 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">My Profile</h1>
        <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-stone-400 hover:text-red-500 transition-colors">
          <LogOut className="w-4 h-4" /> Log out
        </button>
      </div>

      {/* Plan badge */}
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold mb-6 ${planColor}`}>
        <Shield className="w-4 h-4" /> {planLabel} Plan
        {user?.plan === 'free' && (
          <Link href="/pricing" className="ml-2 text-xs text-brand-700 dark:text-brand-400 underline font-semibold">Upgrade →</Link>
        )}
      </div>

      <div className="card p-6 space-y-5">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Full name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input value={name} onChange={e => setName(e.target.value)} className="input pl-9" placeholder="Your name" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Email address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input value={user?.email ?? ''} disabled className="input pl-9 opacity-60 cursor-not-allowed" />
            </div>
            <p className="text-xs text-stone-400 mt-1">Email cannot be changed here</p>
          </div>

          <button type="submit" disabled={saving || !name.trim()}
            className="flex items-center gap-2 px-6 py-2.5 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-lg hover:bg-brand-600 disabled:opacity-60 transition-colors">
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>

        <div className="border-t border-stone-100 dark:border-[#234533] pt-5">
          <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-3">Quick links</h3>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard" className="px-4 py-2 text-xs font-semibold border border-stone-200 dark:border-[#234533] rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#1C3829] transition-colors">Dashboard</Link>
            <Link href="/applications" className="px-4 py-2 text-xs font-semibold border border-stone-200 dark:border-[#234533] rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#1C3829] transition-colors">Applications</Link>
            <Link href="/pricing" className="px-4 py-2 text-xs font-semibold border border-brand-600 dark:border-brand-500 rounded-lg text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors flex items-center gap-1"><Zap className="w-3 h-3" /> Upgrade Plan</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="max-w-[600px] mx-auto px-5 py-10 animate-pulse"><div className="skeleton h-64 rounded-lg" /></div>}>
      <ProfileContent />
    </Suspense>
  );
}
