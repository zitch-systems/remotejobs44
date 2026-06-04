'use client';
import Link from 'next/link';
import { modalService } from '@/components/ui/Modal';
import { usePaystack } from '@/hooks/usePaystack';
import { createClient } from '@/lib/supabase/client';

interface PaywallModalProps { mode: 'login' | 'subscribe'; }

const PLANS = [
  { id: 'daily'      as const, label: 'Day Pass',    price: '₦500',    originalPrice: '₦2,000',  sub: '24-hour full access',   highlight: false },
  { id: 'pro'        as const, label: 'Pro Monthly', price: '₦2,999',  originalPrice: '₦8,999',  sub: 'per month',             highlight: true  },
  { id: 'pro_annual' as const, label: 'Pro Annual',  price: '₦29,999', originalPrice: '₦89,999', sub: 'per year · save ₦5,989', highlight: false },
];

export function PaywallModal({ mode }: PaywallModalProps) {
  const isLogin = mode === 'login';
  const { pay, loading } = usePaystack();

  async function handleGoogleLogin() {
    modalService.close();
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
  }

  async function handlePay(planId: 'daily' | 'pro' | 'pro_annual') {
    modalService.close();
    await pay({ plan: planId });
  }

  return (
    <div className="p-8 text-center">
      <div className="text-5xl mb-4">{isLogin ? '👋' : '🔓'}</div>
      <h2 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight mb-3">
        {isLogin ? 'Log in to Apply' : 'Unlock Full Access'}
      </h2>
      <p className="text-sm text-stone-500 dark:text-stone-400 max-w-xs mx-auto mb-6 leading-relaxed">
        {isLogin
          ? 'Create a free account or log in to view job details and start applying.'
          : 'Unlock apply links, contact emails, and auto-apply with your CV.'}
      </p>

      {isLogin ? (
        <div className="flex flex-col gap-3">
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 py-3 border border-stone-200 dark:border-[#1e3a5f] rounded-xl bg-white dark:bg-[#0d1a2e] hover:bg-stone-50 dark:hover:bg-[#162033] text-stone-800 dark:text-stone-100 text-sm font-semibold transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
              <path d="M47.5 24.6c0-1.6-.1-3.2-.4-4.7H24v8.9h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.2 7.3-10.5 7.3-17.4z" fill="#4285F4"/>
              <path d="M24 48c6.5 0 12-2.1 16-5.8l-7.9-6c-2.2 1.5-5 2.3-8.1 2.3-6.2 0-11.5-4.2-13.4-9.9H2.5v6.2C6.5 42.6 14.7 48 24 48z" fill="#34A853"/>
              <path d="M10.6 28.6A14.8 14.8 0 0 1 9.8 24c0-1.6.3-3.2.8-4.6v-6.2H2.5A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.8l8.1-6.2z" fill="#FBBC05"/>
              <path d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.8-6.8C35.9 2.3 30.4 0 24 0 14.7 0 6.5 5.4 2.5 13.2l8.1 6.2C12.5 13.7 17.8 9.5 24 9.5z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <hr className="flex-1 border-stone-200 dark:border-[#1e3a5f]" />
            <span className="text-xs text-stone-400 dark:text-stone-500 font-medium">or</span>
            <hr className="flex-1 border-stone-200 dark:border-[#1e3a5f]" />
          </div>

          <div className="flex gap-3 flex-wrap">
            <Link href="/login" onClick={() => modalService.close()}
              className="flex-1 min-w-[120px] py-3 px-6 text-sm font-semibold border border-stone-200 dark:border-[#1e3a5f] rounded-xl hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors text-center">
              Log In
            </Link>
            <Link href="/register" onClick={() => modalService.close()}
              className="flex-1 min-w-[120px] py-3 px-6 text-sm font-semibold bg-brand-700 text-white rounded-xl hover:bg-brand-600 transition-colors text-center">
              Create Free Account
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 mb-5">
            {PLANS.map(p => (
              <button
                key={p.id}
                onClick={() => handlePay(p.id)}
                disabled={loading}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border-2 text-left transition-all hover:-translate-y-0.5 disabled:opacity-60 ${
                  p.highlight
                    ? 'border-brand-600 dark:border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                    : 'border-stone-200 dark:border-[#1e3a5f] hover:border-stone-300 dark:hover:border-[#2d5240]'
                }`}
              >
                <div>
                  <p className="text-sm font-bold text-stone-900 dark:text-stone-100">{p.label}</p>
                  <p className="text-xs text-stone-400 dark:text-stone-500">{p.sub}</p>
                </div>
                <div className="text-right shrink-0">
                  {/* Promo anchor — display only; real charge unchanged (lib/paystack/plans.ts). */}
                  <span className="block text-xs text-stone-400 dark:text-stone-500 line-through">{p.originalPrice}</span>
                  <span className={`font-display font-extrabold text-lg ${p.highlight ? 'text-brand-700 dark:text-brand-400' : 'text-stone-900 dark:text-stone-100'}`}>
                    {p.price}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <Link href="/pricing" onClick={() => modalService.close()}
            className="text-xs text-stone-400 dark:text-stone-500 hover:underline block mb-3">
            See full plan comparison →
          </Link>
          <p className="text-xs text-stone-400 dark:text-stone-500">
            Already subscribed?{' '}
            <Link href="/login" onClick={() => modalService.close()} className="text-brand-700 dark:text-brand-400 font-semibold hover:underline">Log in</Link>
          </p>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-2">✅ Cancel anytime · 🔒 Secure via Paystack</p>
        </>
      )}
    </div>
  );
}
