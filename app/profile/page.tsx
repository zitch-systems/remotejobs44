'use client';
import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Mail, Save, Zap, Shield, LogOut, Upload, FileText, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore, useUIStore } from '@/lib/store';

function ProfileContent() {
  const router   = useRouter();
  const supabase = createClient();
  const { user, setUser, isPro } = useAuthStore();
  const { toast } = useUIStore();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [name,       setName]       = useState('');
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [cvUrl,      setCvUrl]      = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login?next=/profile'); return; }
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (profile) {
        setUser({ id: session.user.id, email: session.user.email!, name: profile.name ?? '', plan: profile.plan ?? 'free', role: profile.role ?? 'user', joinedAt: profile.created_at, profileCompletion: profile.profile_completion ?? 20 });
        setName(profile.name ?? '');
        setCvUrl((profile as any).cv_url ?? null);
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

  async function handleCvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const form = new FormData();
    form.append('cv', file);
    const res = await fetch('/api/cv', { method: 'POST', body: form });
    const data = await res.json();
    if (data.error) { toast(data.error, 'error'); }
    else { setCvUrl(data.url); toast('CV uploaded ✅', 'success'); }
    setUploading(false);
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">My Profile</h1>
        <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-stone-400 hover:text-red-500 transition-colors">
          <LogOut className="w-4 h-4" /> Log out
        </button>
      </div>

      {/* Plan */}
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold mb-6 ${planColor}`}>
        <Shield className="w-4 h-4" /> {planLabel} Plan
        {user?.plan === 'free' && (
          <Link href="/pricing" className="ml-2 text-xs text-brand-700 dark:text-brand-400 underline font-semibold">Upgrade →</Link>
        )}
      </div>

      <div className="space-y-5">
        {/* Profile info */}
        <div className="card p-6">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-4">Personal Info</h2>
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
            </div>
            <button type="submit" disabled={saving || !name.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-lg hover:bg-brand-600 disabled:opacity-60 transition-colors">
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* CV Upload */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100">Your CV / Resume</h2>
              <p className="text-xs text-stone-400 mt-0.5">PDF or Word, max 5MB. Used for auto-apply on Pro.</p>
            </div>
            {!isPro() && (
              <Link href="/pricing" className="flex items-center gap-1 text-xs text-brand-700 dark:text-brand-400 font-semibold">
                <Zap className="w-3 h-3" /> Pro only
              </Link>
            )}
          </div>

          {cvUrl ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 mb-3">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-700 dark:text-green-400">CV uploaded</p>
                <a href={cvUrl} target="_blank" rel="noopener" className="text-xs text-green-600 dark:text-green-500 hover:underline truncate block">View your CV →</a>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-stone-50 dark:bg-[#162033] border border-stone-200 dark:border-[#1e3a5f] mb-3">
              <FileText className="w-5 h-5 text-stone-400 shrink-0" />
              <p className="text-sm text-stone-400">No CV uploaded yet</p>
            </div>
          )}

          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleCvUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !isPro()}
            className="flex items-center gap-2 px-4 py-2.5 border border-stone-200 dark:border-[#1e3a5f] rounded-lg text-sm font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#162033] disabled:opacity-50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading…' : cvUrl ? 'Replace CV' : 'Upload CV'}
          </button>
          {!isPro() && <p className="text-xs text-stone-400 mt-2">Upgrade to Pro to upload your CV and enable auto-apply.</p>}
        </div>

        {/* Quick links */}
        <div className="card p-5">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-3">Quick links</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard"    className="px-4 py-2 text-xs font-semibold border border-stone-200 dark:border-[#1e3a5f] rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">Dashboard</Link>
            <Link href="/applications" className="px-4 py-2 text-xs font-semibold border border-stone-200 dark:border-[#1e3a5f] rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">Applications</Link>
            <Link href="/pricing"      className="px-4 py-2 text-xs font-semibold border border-brand-600 dark:border-brand-500 rounded-lg text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors flex items-center gap-1">
              <Zap className="w-3 h-3" /> Upgrade Plan
            </Link>
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
