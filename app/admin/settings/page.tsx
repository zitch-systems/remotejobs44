'use client';
import { useState } from 'react';
import { Save, Key, Globe, Bell } from 'lucide-react';
import { useUIStore } from '@/lib/store';

export default function AdminSettingsPage() {
  const { toast } = useUIStore();
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    toast('Settings saved ✅', 'success');
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-[700px] mx-auto px-5 py-8">
      <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight mb-8">Settings</h1>

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
              <input defaultValue="RemoteJobs44" className="input" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Support Email</label>
              <input defaultValue="hello@remotejobs44.com" type="email" className="input" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Jobs per page</label>
              <select defaultValue="12" className="input">
                {[6, 9, 12, 18, 24].map(n => <option key={n} value={n}>{n}</option>)}
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
              { label: 'Day Pass Plan Code', key: 'PAYSTACK_DAILY_PLAN_CODE' },
              { label: 'Pro Monthly Plan Code', key: 'PAYSTACK_PRO_MONTHLY_PLAN_CODE' },
              { label: 'Pro Annual Plan Code', key: 'PAYSTACK_PRO_ANNUAL_PLAN_CODE' },
            ].map(item => (
              <div key={item.key}>
                <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1">{item.label}</label>
                <div className="flex gap-2">
                  <input placeholder={`Set in Vercel env: ${item.key}`} className="input font-mono text-xs" disabled />
                </div>
              </div>
            ))}
            <p className="text-xs text-stone-400 mt-2">Plan codes are set as environment variables in Vercel. <a href="https://vercel.com" target="_blank" rel="noopener" className="text-brand-700 dark:text-brand-400 hover:underline">Open Vercel →</a></p>
          </div>
        </div>

        {/* Notifications */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Bell className="w-4 h-4 text-stone-400" />
            <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100">Notifications</h2>
          </div>
          <div className="space-y-3">
            {[
              { label: 'New user registration', defaultChecked: true },
              { label: 'New subscription', defaultChecked: true },
              { label: 'Payment failure', defaultChecked: true },
              { label: 'Daily job sync report', defaultChecked: false },
            ].map(item => (
              <label key={item.label} className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" defaultChecked={item.defaultChecked}
                  className="w-4 h-4 rounded border-stone-300 text-brand-700 focus:ring-brand-600" />
                <span className="text-sm text-stone-700 dark:text-stone-300">{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        <button onClick={handleSave}
          className="flex items-center gap-2 px-6 py-3 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-lg hover:bg-brand-600 transition-colors">
          <Save className="w-4 h-4" />
          {saved ? 'Saved ✅' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
