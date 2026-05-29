'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CreditCard, Calendar, CheckCircle, XCircle, AlertCircle,
  ArrowLeft, RefreshCw, Trash2, Zap, Bell,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';

interface Subscription {
  plan: string; billing: string; status: string;
  price: number | null; currency: string | null;
  current_period_start: string | null; current_period_end: string | null;
  created_at: string;
}

export default function BillingPage() {
  const router = useRouter();
  const { user, setUser, isLoggedIn } = useAuthStore();
  const { toast } = useUIStore();

  const [loading,    setLoading]    = useState(true);
  const [subscription, setSub]      = useState<Subscription | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [emailPrefs, setEmailPrefs] = useState<Record<string, boolean> | null>(null);
  const [savingPref, setSavingPref] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) { router.replace('/login?next=/profile/billing'); return; }
    (async () => {
      const [billRes, prefRes] = await Promise.all([
        fetch('/api/profile/billing'),
        fetch('/api/profile/email-prefs'),
      ]);
      if (billRes.ok) {
        const data = await billRes.json();
        setSub(data.subscription);
      }
      if (prefRes.ok) {
        const data = await prefRes.json();
        setEmailPrefs(data.prefs);
      }
      setLoading(false);
    })();
  }, []);

  async function togglePref(key: string, value: boolean) {
    if (!emailPrefs) return;
    setSavingPref(key);
    const prev = emailPrefs;
    // Optimistic update so the checkbox flips instantly; revert on error.
    setEmailPrefs({ ...emailPrefs, [key]: value });
    const res = await fetch('/api/profile/email-prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
    if (!res.ok) {
      setEmailPrefs(prev);
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'Failed to update preference', 'error');
    }
    setSavingPref(null);
  }

  async function handleCancel() {
    setCancelling(true);
    const res = await fetch('/api/profile/cancel-subscription', { method: 'POST' });
    const data = await res.json();
    setCancelling(false);
    if (!res.ok) { toast(data.error ?? 'Cancellation failed', 'error'); return; }
    setShowCancel(false);
    setSub(s => s ? { ...s, status: 'cancelled' } : s);
    // No setUser refresh here. Cancellation is "soft" — user keeps their
    // current plan until plan_expires_at passes (cron flips them then).
    // The previous version did
    //   setUser({ ...user, ...(profile?.user ?? profile ?? {}) })
    // which was broken: `profile.user` is undefined and `profile` is the
    // /api/profile response shape `{ profile: {...} }`, so it spread the
    // wrapper object instead of the profile fields. Removing the refresh
    // entirely is correct because cancel doesn't change `user.plan` — the
    // local subscription card already updated (line 79) and the Header
    // badge still shows the right plan until cron expiry.
    toast(
      data.access_until
        ? `Cancelled. You keep access until ${new Date(data.access_until).toLocaleDateString()}.`
        : 'Subscription cancelled.',
      'success', 6000
    );
  }

  async function handleDelete() {
    if (deleteConfirm !== 'DELETE') {
      toast('Type DELETE to confirm', 'error');
      return;
    }
    setDeleting(true);
    const res = await fetch('/api/profile/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDeleting(false);
      toast(data.error ?? 'Account deletion failed', 'error');
      return;
    }
    // Wipe local state and redirect to home.
    setUser(null);
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('sb-') || k.startsWith('supabase') || k.startsWith('rj44')) {
          localStorage.removeItem(k);
        }
      });
    } catch {}
    window.location.replace('/?account=deleted');
  }

  if (loading) return (
    <div className="max-w-[700px] mx-auto px-5 py-10 animate-pulse">
      <div className="skeleton h-8 w-48 rounded mb-6" />
      <div className="skeleton h-48 rounded-lg" />
    </div>
  );

  const planLabel =
    user?.plan === 'pro'   ? 'Pro' :
    user?.plan === 'daily' ? 'Day Pass' :
    user?.plan === 'admin' ? 'Admin' :
                             'Free';

  const fmtMoney = (amt: number | null, cur: string | null) =>
    amt == null ? '—' : `${cur === 'NGN' || !cur ? '₦' : cur + ' '}${amt.toLocaleString()}`;

  return (
    <div className="max-w-[700px] mx-auto px-5 py-10">
      <Link href="/profile" className="flex items-center gap-2 text-sm text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors mb-4 w-fit">
        <ArrowLeft className="w-4 h-4" /> Back to profile
      </Link>

      <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight mb-1">
        Billing
      </h1>
      <p className="text-sm text-stone-400 mb-8">Manage your plan, billing, and account.</p>

      {/* Current plan card */}
      <div className="card p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Current plan</p>
            <p className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 mt-0.5">
              {planLabel}
            </p>
            {subscription?.current_period_end && (
              <p className="text-xs text-stone-400 mt-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {subscription.status === 'cancelled'
                  ? `Access ends ${new Date(subscription.current_period_end).toLocaleDateString()}`
                  : `Renews ${new Date(subscription.current_period_end).toLocaleDateString()}`}
              </p>
            )}
          </div>
          {user?.plan === 'free' && (
            <Link href="/pricing"
              className="flex items-center gap-2 px-4 py-2 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors">
              <Zap className="w-4 h-4" /> Upgrade
            </Link>
          )}
        </div>

        {subscription && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-stone-100 dark:border-[#1e3a5f] text-sm">
            <Meta label="Billing"        value={subscription.billing} />
            <Meta label="Price"          value={fmtMoney(subscription.price, subscription.currency)} />
            <Meta label="Status"         value={subscription.status} statusBadge />
            <Meta label="Started"        value={new Date(subscription.created_at).toLocaleDateString()} />
          </div>
        )}
      </div>

      {/* Active subscription — manage */}
      {subscription && subscription.status === 'active' && (
        <div className="card p-6 mb-5">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-2 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-brand-600" /> Manage subscription
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">
            Cancellation takes effect at the end of your current billing period — you keep Pro access until then.
          </p>
          {!showCancel ? (
            <button onClick={() => setShowCancel(true)}
              className="px-4 py-2 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-sm font-semibold rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
              Cancel subscription
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm text-red-600 dark:text-red-400 font-semibold mr-2">Are you sure?</p>
              <button onClick={handleCancel} disabled={cancelling}
                className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                {cancelling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                Yes, cancel
              </button>
              <button onClick={() => setShowCancel(false)} disabled={cancelling}
                className="px-4 py-2 border border-stone-200 dark:border-[#1e3a5f] text-sm font-semibold text-stone-600 dark:text-stone-300 rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
                Keep it
              </button>
            </div>
          )}
        </div>
      )}

      {subscription?.status === 'cancelled' && (
        <div className="card p-5 mb-5 border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-900/10">
          <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Subscription cancelled — won&rsquo;t renew. You keep access until{' '}
            {subscription.current_period_end && new Date(subscription.current_period_end).toLocaleDateString()}.
          </p>
          <Link href="/pricing"
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors">
            Re-subscribe
          </Link>
        </div>
      )}

      {/* Email preferences */}
      {emailPrefs && (
        <div className="card p-6 mb-5">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-2 flex items-center gap-2">
            <Bell className="w-4 h-4 text-brand-600" /> Email notifications
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">
            Choose what we email you. Billing receipts always send — they&rsquo;re required by Paystack.
          </p>
          <div className="space-y-3">
            {([
              { key: 'job_alerts',      label: 'Job alerts',      desc: 'Personalised job matches & saved-search digests.' },
              { key: 'product_updates', label: 'Product updates', desc: 'New features, ATS adapters, big improvements.' },
              { key: 'marketing',       label: 'Marketing',       desc: 'Tips, founder notes, occasional promos.' },
              { key: 'billing',         label: 'Billing & receipts', desc: 'Required transactional emails (always on).' },
            ] as const).map(row => {
              const checked = emailPrefs[row.key] ?? true;
              const forced  = row.key === 'billing'; // can't turn off receipts
              return (
                <label key={row.key} className="flex items-start gap-3 p-3 rounded-lg border border-stone-100 dark:border-[#1e3a5f] hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forced ? true : checked}
                    disabled={forced || savingPref === row.key}
                    onChange={e => !forced && togglePref(row.key, e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-stone-300 dark:border-[#1e3a5f] text-brand-600 focus:ring-brand-500 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">{row.label}</p>
                    <p className="text-xs text-stone-400 dark:text-stone-500">{row.desc}</p>
                  </div>
                  {savingPref === row.key && (
                    <RefreshCw className="w-3.5 h-3.5 text-stone-400 animate-spin shrink-0 mt-1" />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete account */}
      <div className="card p-6 border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-900/5">
        <h2 className="font-bold text-sm text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> Delete account
        </h2>
        <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">
          Permanently wipes your profile, applications, saved jobs, and subscription. Cannot be undone.
        </p>

        {!showDelete ? (
          <button onClick={() => setShowDelete(true)}
            className="px-4 py-2 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-sm font-semibold rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
            Delete my account
          </button>
        ) : (
          <div className="space-y-3">
            <input
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder='Type "DELETE" to confirm'
              className="input text-sm"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={handleDelete} disabled={deleting || deleteConfirm !== 'DELETE'}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Permanently delete
              </button>
              <button onClick={() => { setShowDelete(false); setDeleteConfirm(''); }} disabled={deleting}
                className="px-4 py-2 border border-stone-200 dark:border-[#1e3a5f] text-sm font-semibold text-stone-600 dark:text-stone-300 rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
                Nevermind
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value, statusBadge }: { label: string; value: string; statusBadge?: boolean }) {
  if (statusBadge) {
    const color =
      value === 'active'    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400' :
      value === 'cancelled' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
                              'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400';
    return (
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1">{label}</p>
        <span className={cn('badge', color)}>
          {value === 'active' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {value}
        </span>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1">{label}</p>
      <p className="text-sm text-stone-800 dark:text-stone-200 truncate capitalize">{value}</p>
    </div>
  );
}
