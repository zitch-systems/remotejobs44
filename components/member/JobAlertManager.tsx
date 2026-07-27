'use client';
// components/member/JobAlertManager.tsx — create / list / delete job alerts.
//
// This is the missing half of the alerts feature. /api/alerts has existed
// with full GET+POST+DELETE for a while, but nothing in the app ever called
// it, so `job_alerts` stayed empty and the daily cron's alert branch — which
// loops over exactly that table — has never sent a single email. The
// register page meanwhile advertises "Daily alerts for roles that fit you".
//
// Entitlement comes from the server (`canCreate` on the GET response), not
// from the client plan store: that copy lives in localStorage where a user
// can edit it, and resolvePlan's expiry handling is subtle enough that a
// second client-side implementation would drift from the cron's filter.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, Plus, Trash2, Loader2, Lock } from 'lucide-react';
import { CATEGORY_META } from '@/lib/utils';
import { useUIStore } from '@/lib/store';

type Alert = {
  id: string;
  category: string | null;
  keywords: string | null;
  frequency: string;
  active: boolean;
};

// 'all' first, then the real categories. Keys match `jobs.category` exactly
// (CATEGORY_META is the same map the admin job form and the listing filters
// use), which matters because the cron compares them case-insensitively.
const CATEGORY_OPTIONS = Object.entries(CATEGORY_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

export function JobAlertManager() {
  const { toast } = useUIStore();
  const [alerts, setAlerts]   = useState<Alert[]>([]);
  const [canCreate, setCan]   = useState(false);
  const [confirmed, setConf]  = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [busyId, setBusyId]   = useState<string | null>(null);
  const [category, setCat]    = useState('all');
  const [keywords, setKw]     = useState('');

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/alerts');
      if (!res.ok) throw new Error('Could not load your alerts.');
      const data = await res.json();
      setAlerts(data.alerts ?? []);
      setCan(!!data.canCreate);
      setConf(data.emailConfirmed !== false);
    } catch {
      toast('Could not load your job alerts.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const res  = await fetch('/api/alerts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ category, keywords: keywords.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Could not create the alert.');
      setAlerts(prev => [data.alert, ...prev]);
      setKw('');
      setCat('all');
      toast('Alert created. New matches arrive each morning.', 'success');
    } catch (err: any) {
      toast(err?.message ?? 'Could not create the alert.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (busyId) return;
    setBusyId(id);
    // Keep a copy so a failed delete can put the row back rather than
    // leaving the list disagreeing with the database.
    const previous = alerts;
    setAlerts(prev => prev.filter(a => a.id !== id));
    try {
      const res = await fetch('/api/alerts', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Could not delete the alert.');
      toast('Alert removed.', 'success');
    } catch (err: any) {
      setAlerts(previous);
      toast(err?.message ?? 'Could not delete the alert.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="ja-panel">
      <div className="ja-head">
        <div className="ja-ic"><Bell /></div>
        <div>
          <div className="ja-title">Job alert emails</div>
          <div className="ja-sub">
            Get new roles matching your search emailed to you each morning.
          </div>
        </div>
      </div>

      {loading ? (
        <div className="ja-loading"><Loader2 className="ja-spin" /> Loading your alerts…</div>
      ) : !canCreate ? (
        <div className="ja-locked">
          <Lock />
          <div>
            <strong>Job alerts are a Pro feature.</strong>
            <p>
              Upgrade to a monthly or annual plan and we&apos;ll email you new roles
              that match your search, every morning.
            </p>
            <Link href="/pricing" className="btn btn-primary btn-sm">View plans</Link>
          </div>
        </div>
      ) : (
        <>
          {!confirmed && (
            <p className="ja-note">
              Confirm your email address before creating an alert — check your inbox
              for the verification link.
            </p>
          )}

          <form className="ja-form" onSubmit={create}>
            <label className="ja-field">
              <span>Category</span>
              <select value={category} onChange={e => setCat(e.target.value)} disabled={saving}>
                {CATEGORY_OPTIONS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="ja-field ja-grow">
              <span>Keywords <em>(optional)</em></span>
              <input
                type="text"
                value={keywords}
                maxLength={200}
                placeholder="e.g. react, senior"
                onChange={e => setKw(e.target.value)}
                disabled={saving}
              />
            </label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? <Loader2 className="ja-spin" /> : <Plus />}
              Create alert
            </button>
          </form>
          <p className="ja-hint">
            Every keyword must appear in the job title or company name. Leave it
            blank to get everything in the category.
          </p>

          <div className="ja-list">
            {alerts.length === 0 && (
              <div className="ja-empty">No alerts yet. Create one above.</div>
            )}
            {alerts.map(a => {
              const catKey   = (a.category ?? 'all') as keyof typeof CATEGORY_META;
              const catLabel = CATEGORY_META[catKey]?.label ?? a.category ?? 'All Jobs';
              return (
                <div key={a.id} className="ja-row">
                  <div className="ja-row-text">
                    <span className="ja-cat">{catLabel}</span>
                    {a.keywords
                      ? <span className="ja-kw">{a.keywords}</span>
                      : <span className="ja-kw ja-muted">all roles</span>}
                  </div>
                  <button
                    type="button"
                    className="ja-del"
                    onClick={() => remove(a.id)}
                    disabled={busyId === a.id}
                    aria-label={`Delete ${catLabel} alert`}
                  >
                    {busyId === a.id ? <Loader2 className="ja-spin" /> : <Trash2 />}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
