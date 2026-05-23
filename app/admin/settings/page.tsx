'use client';
import { useState, useEffect } from 'react';
import { Save, Key, Globe, Bell, Info } from 'lucide-react';
import { useUIStore } from '@/lib/store';

const STORAGE_KEY = 'rj44-admin-settings';

interface Settings {
  siteName:      string;
  supportEmail:  string;
  jobsPerPage:   string;
  notifyNewUser: boolean;
  notifyNewSub:  boolean;
  notifyPayFail: boolean;
  notifyDailySync: boolean;
}

const DEFAULTS: Settings = {
  siteName:      'RemoteJobs44',
  supportEmail:  'hello@remotejobs44.com',
  jobsPerPage:   '12',
  notifyNewUser: true,
  notifyNewSub:  true,
  notifyPayFail: true,
  notifyDailySync: false,
};

export default function AdminSettingsPage() {
  const { toast } = useUIStore();
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  // Load persisted settings on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSettings({ ...DEFAULTS, ...JSON.parse(saved) });
    } catch {}
  }, []);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Persist site settings to Supabase via API
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!res.ok) throw new Error('API error');

      // Also persist to localStorage as a local cache
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      toast('Settings saved ✅', 'success');
    } catch {
      // Fallback: at least save locally so the form state persists
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
      toast('Settings saved locally. Connect Supabase settings table for full persistence.', 'info', 5000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-[700px] mx-auto px-5 py-8">
      <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight mb-8">
        Settings
      </h1>

      <div className="space-y-6">
        {/* Site settings */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Globe className="w-4 h-4 text-stone-400" />
            <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100">Site Settings</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Site Name</label>
              <input
                value={settings.siteName}
                onChange={e => set('siteName', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Support Email</label>
              <input
                value={settings.supportEmail}
                onChange={e => set('supportEmail', e.target.value)}
                type="email"
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Jobs per page</label>
              <select
                value={settings.jobsPerPage}
                onChange={e => set('jobsPerPage', e.target.value)}
                className="input"
              >
                {[6, 9, 12, 18, 24].map(n => <option key={n} value={String(n)}>{n}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Paystack settings */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Key className="w-4 h-4 text-stone-400" />
            <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100">Paystack</h2>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Day Pass Plan Code',      key: 'PAYSTACK_DAILY_PLAN_CODE' },
              { label: 'Pro Monthly Plan Code',   key: 'PAYSTACK_PRO_MONTHLY_PLAN_CODE' },
              { label: 'Pro Annual Plan Code',    key: 'PAYSTACK_PRO_ANNUAL_PLAN_CODE' },
            ].map(item => (
              <div key={item.key}>
                <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1">{item.label}</label>
                <input
                  placeholder={`Set in Vercel env: ${item.key}`}
                  className="input font-mono text-xs text-stone-400"
                  disabled
                />
              </div>
            ))}
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg mt-2">
              <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-400">
                Paystack plan codes are set as environment variables in{' '}
                <a href="https://vercel.com/dashboard" target="_blank" rel="noopener" className="underline font-semibold">Vercel Dashboard</a>
                {' '}→ Project → Settings → Environment Variables.
                Also set <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">NEXT_PUBLIC_APP_URL</code> to your production URL.
              </p>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Bell className="w-4 h-4 text-stone-400" />
            <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100">Admin Notifications</h2>
          </div>
          <div className="space-y-3">
            {([
              { label: 'New user registration',  key: 'notifyNewUser'    },
              { label: 'New subscription',       key: 'notifyNewSub'     },
              { label: 'Payment failure',        key: 'notifyPayFail'    },
              { label: 'Daily job sync report',  key: 'notifyDailySync'  },
            ] as { label: string; key: keyof Settings }[]).map(item => (
              <label key={item.key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings[item.key] as boolean}
                  onChange={e => set(item.key, e.target.checked)}
                  className="w-4 h-4 rounded border-stone-300 text-brand-700 focus:ring-brand-600"
                />
                <span className="text-sm text-stone-700 dark:text-stone-300">{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving…
            </>