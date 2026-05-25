'use client';
import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Mail, Save, Zap, Shield, LogOut, Upload, FileText, CheckCircle, Brain, Sparkles, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore, useUIStore } from '@/lib/store';
import { resolveRole } from '@/lib/auth/redirect';

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

  // AI CV review state — pasted CV text and the structured feedback we get back.
  const [cvText, setCvText]       = useState('');
  const [targetRole, setTargetRole] = useState('Remote');
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview]       = useState<any>(null);

  async function handleReview() {
    if (cvText.trim().length < 50) { toast('Paste at least 50 characters of your CV', 'error'); return; }
    setReviewing(true); setReview(null);
    try {
      const r = await fetch('/api/ai/cv-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cv: cvText.trim(), role: targetRole.trim() || 'Remote' }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Review failed');
      setReview(j.review);
    } catch (err: any) {
      toast(err.message ?? 'Review failed', 'error');
    } finally {
      setReviewing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const userRace = await Promise.race([
        supabase.auth.getUser(),
        new Promise<null>(res => setTimeout(() => res(null), 6000)),
      ]);
      if (cancelled) return;
      if (!userRace) { setLoading(false); return; } // network timeout — stay on page
      const { data: { user: authUser }, error } = userRace;
      if (error?.status === 401 || error?.status === 403) { router.replace('/login?next=/profile'); return; }
      if (error) { setLoading(false); return; } // network blip — stay on page
      if (!authUser) { router.replace('/login?next=/profile'); return; }

      let profile: any = null;
      try {
        const queryPromise = supabase
          .from('profiles').select('*').eq('id', authUser.id).maybeSingle()
          .then(({ data }) => data);
        const timeoutPromise = new Promise<null>(res => setTimeout(() => res(null), 5000));
        profile = await Promise.race([queryPromise, timeoutPromise]);
      } catch {}
      if (cancelled) return;

      if (profile) {
        const role = resolveRole({ profileRole: profile.role, email: authUser.email });
        const plan = role === 'admin' ? 'admin' : (profile.plan ?? 'free');
        setUser({ id: authUser.id, email: authUser.email!, name: profile.name ?? '', plan, role, joinedAt: profile.created_at, profileCompletion: profile.profile_completion ?? 20 });
        setName(profile.name ?? '');
        setCvUrl(profile.cv_url ?? null);
      }
      // No profile (timeout/network): KEEP whatever was previously in the
      // store. Don't overwrite plan with 'free' just because the lookup
      // failed — that's the "user appears unsubscribed" bug.
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
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
    setUser(null);
    try { localStorage.removeItem('rj44-auth'); localStorage.removeItem('rj44-jobs'); } catch {}
    try { await supabase.auth.signOut(); } catch {}
    window.location.replace('/');
  }

  if (loading) return <div className="max-w-[600px] mx-auto px-5 py-10 animate-pulse"><div className="skeleton h-8 w-48 rounded mb-6" /><div className="skeleton h-64 rounded-lg" /></div>;

  const planLabel = user?.plan === 'daily' ? 'Day Pass ☀️' : user?.plan === 'pro' ? 'Pro ⭐' : user?.plan === 'admin' ? 'Admin 🔧' : 'Free';
  const planColor = user?.plan === 'free' ? 'bg-stone-100 dark:bg-stone-800 text-stone-500' : 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400';

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
            <div className="flex items-center gap-3 p-3 rounded-lg bg-brand-50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800 mb-3">
              <CheckCircle className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-brand-700 dark:text-brand-400">CV uploaded</p>
                <a href={cvUrl} target="_blank" rel="noopener" className="text-xs text-brand-600 dark:text-brand-400 hover:underline truncate block">View your CV →</a>
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

        {/* AI CV Review */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Brain className="w-4 h-4 text-brand-600" /> AI CV Review
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">Paste your CV text below. Get scored feedback, gaps, and rewrite tips in seconds.</p>
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-[10px] font-bold uppercase tracking-wider"><Sparkles className="w-3 h-3" />AI</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1">Target role</label>
              <input type="text" value={targetRole} onChange={e => setTargetRole(e.target.value)} className="input text-sm" placeholder="e.g. Senior Backend Engineer" maxLength={100} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1">Your CV text</label>
              <textarea value={cvText} onChange={e => setCvText(e.target.value)} rows={6} maxLength={12000}
                placeholder="Paste your CV / résumé text here (max 12,000 chars)…"
                className="input text-sm font-mono resize-y" />
            </div>
            <button onClick={handleReview} disabled={reviewing || cvText.trim().length < 50}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
              {reviewing ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Brain className="w-4 h-4" />}
              {reviewing ? 'Reviewing…' : 'Review my CV'}
            </button>
          </div>

          {review && (
            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-brand-50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800">
                <div className="text-3xl font-display font-extrabold text-brand-700 dark:text-brand-400">{review.overall_score ?? '–'}</div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Overall score / 100</p>
                  <p className="text-sm text-stone-700 dark:text-stone-300 mt-0.5">{review.headline_summary}</p>
                </div>
              </div>

              {Array.isArray(review.strengths) && review.strengths.length > 0 && (
                <ReviewList title="Strengths" icon={<CheckCircle className="w-4 h-4 text-brand-600" />} items={review.strengths} />
              )}
              {Array.isArray(review.gaps) && review.gaps.length > 0 && (
                <ReviewList title="Gaps" icon={<AlertCircle className="w-4 h-4 text-amber-600" />} items={review.gaps} />
              )}
              {Array.isArray(review.ats_keywords_missing) && review.ats_keywords_missing.length > 0 && (
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-wider text-stone-500 mb-2">ATS keywords missing</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {review.ats_keywords_missing.map((k: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-[#162033] text-stone-600 dark:text-stone-300 text-xs font-medium">{k}</span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(review.rewrite_tips) && review.rewrite_tips.length > 0 && (
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-wider text-stone-500 mb-2">Rewrite tips</h3>
                  <ul className="space-y-2">
                    {review.rewrite_tips.map((t: any, i: number) => (
                      <li key={i} className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed pl-4 relative">
                        <span className="absolute left-0 text-brand-600">·</span>
                        <span className="font-semibold text-brand-700 dark:text-brand-400 uppercase text-[10px] tracking-wider mr-1">{t.section}</span>
                        {t.tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
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


function ReviewList({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) {
  return (
    <div>
      <h3 className="font-bold text-xs uppercase tracking-wider text-stone-500 mb-2 flex items-center gap-1.5">{icon} {title}</h3>
      <ul className="space-y-1.5">
        {items.map((s, i) => (
          <li key={i} className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed pl-4 relative">
            <span className="absolute left-0 text-brand-600">·</span>{s}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div className="max-w-[860px] mx-auto px-5 py-8">
      <Suspense fallback={
        <div className="animate-pulse space-y-4">
          <div className="skeleton h-8 w-48 rounded" />
          <div className="skeleton h-64 rounded-lg" />
        </div>
      }>
        <ProfileContent />
      </Suspense>
    </div>
  );
}
