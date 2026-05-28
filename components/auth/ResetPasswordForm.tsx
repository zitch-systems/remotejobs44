'use client';
// components/auth/ResetPasswordForm.tsx
//
// Form-only client island for /reset-password. The page shell (logo,
// heading, "set new password" copy) is server-rendered.
import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUIStore } from '@/lib/store';

export function ResetPasswordForm() {
  const { toast } = useUIStore();
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast('Password must be at least 8 characters', 'error'); return; }
    if (password !== confirm) { toast('Passwords do not match', 'error'); return; }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { toast(error.message, 'error'); setLoading(false); return; }
    toast('Password updated! Please log in.', 'success');
    window.location.replace('/login');
  }

  return (
    <div className="card p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">New Password</label>
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} required value={password}
              onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters"
              className="input pr-10" autoComplete="new-password" />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Confirm Password</label>
          <input type="password" required value={confirm}
            onChange={e => setConfirm(e.target.value)} placeholder="Repeat password"
            className="input" autoComplete="new-password" />
        </div>
        <button type="submit" disabled={loading || !password || !confirm}
          className="w-full flex items-center justify-center gap-2 py-3 bg-brand-700 dark:bg-brand-600 text-white font-bold rounded-lg hover:bg-brand-800 disabled:opacity-60 transition-colors">
          {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Lock className="w-4 h-4" />}
          {loading ? 'Updating…' : 'Set New Password'}
        </button>
      </form>
    </div>
  );
}
