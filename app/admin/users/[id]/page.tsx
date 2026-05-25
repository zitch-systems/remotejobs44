'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Shield, Zap, User, Mail, Calendar, CreditCard,
  Briefcase, RefreshCw, Trash2, KeyRound, Save, AlertTriangle,
  Ban, CheckCircle as Unsuspend,
} from 'lucide-react';
import { useUIStore } from '@/lib/store';
import { cn, formatRelativeDate } from '@/lib/utils';

interface Profile {
  id: string; name: string | null; email: string;
  plan: string; role: string; created_at: string; updated_at: string;
  profile_completion: number | null;
  paystack_customer_code: string | null;
  paystack_subscription_code: string | null;
  suspended: boolean | null;
  suspended_at: string | null;
  suspended_reason: string | null;
}
interface Subscription {
  plan: string; billing: string; status: string;
  price: number | null; currency: string | null;
  current_period_start: string | null; current_period_end: string | null;
  created_at: string;
}
interface Application {
  id: string; job_title: string; company: string;
  status: string; applied_at: string;
}

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useUIStore();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);

  // Local form state for editing — kept separate so we can show a Save button
  // and the user can cancel before persisting.
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/admin/users/${id}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast(j.error ?? 'Failed to load user', 'error');
        setLoading(false);
        return;
      }
      const data = await res.json();
      setProfile(data.profile);
      setSubscription(data.subscription);
      setApplications(data.applications ?? []);
      setName(data.profile.name ?? '');
      setPlan(data.profile.plan);
      setRole(data.profile.role);
      setLoading(false);
    }
    if (id) load();
  }, [id]);

  async function handleSave() {
    if (!profile) return;
    const patch: Record<string, string> = {};
    if (name !== (profile.name ?? '')) patch.name = name;
    if (plan !== profile.plan) patch.plan = plan;
    if (role !== profile.role) patch.role = role;
    if (Object.keys(patch).length === 0) { toast('Nothing to save', 'info'); return; }

    setSaving(true);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { toast(data.error ?? 'Save failed', 'error'); return; }
    toast('Saved', 'success');
    setProfile({ ...profile, ...patch } as Profile);
  }

  async function handleReset() {
    setResetting(true);
    const res = await fetch(`/api/admin/users/${id}/reset-password`, { method: 'POST' });
    const data = await res.json();
    setResetting(false);
    if (!res.ok) { toast(data.error ?? 'Reset failed', 'error'); return; }
    toast(`Recovery email sent to ${data.sent_to}`, 'success');
  }

  async function handleSuspend(nextSuspended: boolean) {
    if (!profile) return;
    setSuspending(true);
    const body: any = { suspended: nextSuspended };
    if (nextSuspended && suspendReason.trim()) body.suspended_reason = suspendReason.trim();
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSuspending(false);
    if (!res.ok) { toast(data.error ?? 'Action failed', 'error'); return; }
    setProfile(p => p ? {
      ...p,
      suspended: nextSuspended,
      suspended_at: nextSuspended ? new Date().toISOString() : null,
      suspended_reason: nextSuspended ? (suspendReason.trim() || null) : null,
    } : p);
    if (!nextSuspended) setSuspendReason('');
    toast(nextSuspended ? 'User suspended' : 'User unsuspended', 'success');
  }

  async function handleDelete() {
    if (!profile || confirmDelete !== profile.email) {
      toast('Type the user\'s email to confirm', 'error');
      return;
    }
    setDeleting(true);
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDeleting(false);
      toast(data.error ?? 'Delete failed', 'error');
      return;
    }
    toast('User deleted', 'success');
    router.replace('/admin/users');
  }

  if (loading) return (
    <div className="max-w-[1000px] mx-auto px-5 py-8 animate-pulse space-y-4">
      <div className="skeleton h-8 w-48 rounded" />
      <div className="skeleton h-64 rounded-lg" />
    </div>
  );
  if (!profile) return (
    <div className="max-w-[1000px] mx-auto px-5 py-20 text-center">
      <p className="text-stone-400 mb-4">User not found.</p>
      <Link href="/admin/users" className="text-brand-700 dark:text-brand-400 font-semibold hover:underline">
        ← Back to users
      </Link>
    </div>
  );

  const dirty = name !== (profile.name ?? '') || plan !== profile.plan || role !== profile.role;

  return (
    <div className="max-w-[1000px] mx-auto px-5 py-8">
      <Link href="/admin/users"
        className="flex items-center gap-2 text-sm text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors mb-4 w-fit">
        <ArrowLeft className="w-4 h-4" /> Back to users
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8 flex-wrap">
        <div className="w-14 h-14 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-xl font-black text-brand-700">
          {(profile.name?.[0] ?? profile.email[0]).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight truncate">
            {profile.name || profile.email.split('@')[0]}
          </h1>
          <p className="text-sm text-stone-400 truncate flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" /> {profile.email}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={cn(
            'badge',
            profile.plan === 'admin' ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400' :
            profile.plan === 'pro'   ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
            profile.plan === 'daily' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' :
                                       'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
          )}>
            {profile.plan === 'admin' ? <Shield className="w-3 h-3" /> :
             profile.plan !== 'free' ? <Zap className="w-3 h-3" /> :
             <User className="w-3 h-3" />}
            {profile.plan}
          </span>
        </div>
      </div>

      {/* Profile + admin controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="md:col-span-2 card p-6 space-y-4">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-2">Profile</h2>

          <Field label="Name">
            <input value={name} onChange={e => setName(e.target.value)}
              className="input text-sm" placeholder="No name set" />
          </Field>

          <Field label="Email">
            <input value={profile.email} disabled
              className="input text-sm opacity-60 cursor-not-allowed" />
            <p className="text-[10px] text-stone-400 mt-1">Email changes must be done via Supabase auth.</p>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Plan">
              <select value={plan} onChange={e => setPlan(e.target.value)} className="input text-sm">
                <option value="free">Free</option>
                <option value="daily">Day Pass</option>
                <option value="pro">Pro</option>
                <option value="admin">Admin (legacy)</option>
              </select>
            </Field>
            <Field label="Role">
              <select value={role} onChange={e => setRole(e.target.value)} className="input text-sm">
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button onClick={handleSave} disabled={!dirty || saving}
              className="flex items-center gap-2 px-4 py-2 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save changes
            </button>
            <button onClick={handleReset} disabled={resetting}
              className="flex items-center gap-2 px-4 py-2 border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 text-sm font-semibold rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] disabled:opacity-50 transition-colors">
              {resetting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Send password reset
            </button>
          </div>
        </div>

        {/* Meta sidebar */}
        <div className="card p-5 space-y-3 text-sm">
          <h2 className="font-bold text-stone-900 dark:text-stone-100 mb-2">Account</h2>
          <Meta icon={<Calendar className="w-3.5 h-3.5" />} label="Joined" value={formatRelativeDate(profile.created_at)} />
          <Meta icon={<RefreshCw className="w-3.5 h-3.5" />} label="Updated" value={profile.updated_at ? formatRelativeDate(profile.updated_at) : '—'} />
          <Meta icon={<User className="w-3.5 h-3.5" />} label="Profile completion" value={`${profile.profile_completion ?? 0}%`} />
          {profile.paystack_customer_code && (
            <Meta icon={<CreditCard className="w-3.5 h-3.5" />} label="Paystack customer" value={profile.paystack_customer_code} />
          )}
        </div>
      </div>

      {/* Subscription */}
      <div className="card p-6 mb-6">
        <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-3 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-brand-600" /> Subscription
        </h2>
        {subscription ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Meta label="Plan"           value={subscription.plan} />
            <Meta label="Billing"        value={subscription.billing} />
            <Meta label="Status"         value={subscription.status} />
            <Meta label="Price"          value={subscription.price ? `${subscription.currency ?? '₦'}${subscription.price.toLocaleString()}` : '—'} />
            <Meta label="Period start"   value={subscription.current_period_start ? new Date(subscription.current_period_start).toLocaleDateString() : '—'} />
            <Meta label="Period end"     value={subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : '—'} />
          </div>
        ) : (
          <p className="text-sm text-stone-400">No subscription on record.</p>
        )}
      </div>

      {/* Applications */}
      <div className="card p-6 mb-6">
        <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-3 flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-brand-600" /> Recent applications ({applications.length})
        </h2>
        {applications.length === 0 ? (
          <p className="text-sm text-stone-400">No applications yet.</p>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-[#1e3a5f]">
            {applications.map(app => (
              <div key={app.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{app.job_title}</p>
                  <p className="text-xs text-stone-400">{app.company} · {formatRelativeDate(app.applied_at)}</p>
                </div>
                <span className="badge bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 text-[10px]">
                  {app.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suspension */}
      <div className={cn(
        'card p-6 mb-6',
        profile.suspended && 'border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-900/5'
      )}>
        <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-2 flex items-center gap-2">
          <Ban className={cn('w-4 h-4', profile.suspended ? 'text-amber-600' : 'text-stone-400')} />
          Account status
          {profile.suspended && (
            <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 ml-2">
              Suspended
            </span>
          )}
        </h2>
        {profile.suspended ? (
          <>
            <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
              Suspended {profile.suspended_at ? formatRelativeDate(profile.suspended_at) : ''}
              {profile.suspended_reason && (
                <> — <span className="italic">"{profile.suspended_reason}"</span></>
              )}
            </p>
            <button onClick={() => handleSuspend(false)} disabled={suspending}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-bold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors">
              {suspending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Unsuspend className="w-3.5 h-3.5" />}
              Unsuspend
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
              Suspended users can still log in but the API treats them as logged-out for any state-changing action.
            </p>
            <input value={suspendReason} onChange={e => setSuspendReason(e.target.value)}
              placeholder="Optional reason (shown in audit log)" maxLength={500}
              className="input text-sm mb-3" />
            <button onClick={() => handleSuspend(true)} disabled={suspending}
              className="flex items-center gap-2 px-4 py-2 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm font-semibold rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/10 disabled:opacity-50 transition-colors">
              {suspending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
              Suspend account
            </button>
          </>
        )}
      </div>

      {/* Danger zone */}
      <div className="card p-6 border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-900/5">
        <h2 className="font-bold text-sm text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Danger zone
        </h2>
        <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
          Deleting wipes the user from <code>auth.users</code> and cascades through profiles,
          applications, saved jobs, and subscriptions. Cannot be undone.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={confirmDelete} onChange={e => setConfirmDelete(e.target.value)}
            placeholder={`Type "${profile.email}" to confirm`}
            className="input text-sm flex-1 min-w-[260px]" />
          <button onClick={handleDelete}
            disabled={deleting || confirmDelete !== profile.email}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {deleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete user
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Meta({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5 mb-0.5">
        {icon}{label}
      </p>
      <p className="text-sm text-stone-800 dark:text-stone-200 truncate">{value}</p>
    </div>
  );
}
