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
    // Trim BEFORE validation so the user's "8 char" includes their
    // accidental trailing space — and so the stored password matches
    // what /login + /register store (both trim too). Without this,
    // resetting to "hello   " stored that raw, but a subsequent login
    // submit was trimmed to "hello" and failed.
    const trimmed        = password.trim();
    const trimmedConfirm = confirm.trim();
    if (trimmed.length < 8) { toast('Password must be at least 8 characters', 'error'); return; }
    if (trimmed !== trimmedConfirm) { toast('Passwords do not match', 'error'); return; }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: trimmed });
    if (error) {
      // Generic message — Supabase auth errors can leak rate-limit
      // hints. Browser console keeps the detail for support.
      console.error('[reset-password]', error.message);
      toast('Could not update password. Please try again.', 'error');
      setLoading(false);
      return;
    }
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
