'use client';
// components/jobs/PaywallModal.tsx
import Link from 'next/link';
import { modalService } from '@/components/ui/Modal';
import { usePaystack } from '@/hooks/usePaystack';

interface PaywallModalProps { mode: 'login' | 'subscribe'; }

const PLANS = [
  { id: 'daily',      label: 'Day Pass',    price: '₦1,000',  sub: '24-hour full access' },
  { id: 'pro',        label: 'Pro Monthly', price: '₦8,999',  sub: 'per month', highlight: true },
  { id: 'pro_annual', label: 'Pro Annual',  price: '₦89,999', sub: 'per year · save ₦17,989' },
];

export function PaywallModal({ mode }: PaywallModalProps) {
  const isLogin = mode === 'login';
  const { pay, loading } = usePaystack();

  async function handlePay(planId: string) {
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
        <div className="flex gap-3 justify-center flex-wrap">
          <Link href="/login" onClick={() => modalService.close()}
            className="flex-1 min-w-[120px] py-3 px-6 text-sm font-semibold border border-stone-200 dark:border-[#234533] rounded-xl hover:bg-stone-50 dark:hover:bg-[#1C3829] transition-colors">
            Log In
          </Link>
          <Link href="/register" onClick={() => modalService.close()}
            className="flex-1 min-w-[120px] py-3 px-6 text-sm font-semibold bg-brand-700 text-white rounded-xl hover:bg-brand-600 transition-colors">
            Create Free Account
          </Link>
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
                    : 'border-stone-200 dark:border-[#234533] hover:border-stone-300 dark:hover:border-[#2d5240]'
                }`}
              >
                <div>
                  <p className="text-sm font-bold text-stone-900 dark:text-stone-100">{p.label}</p>
                  <p className="text-xs text-stone-400 dark:text-stone-500">{p.sub}</p>
                </div>
                <span className={`font-display font-extrabold text-lg ${p.highlight ? 'text-brand-700 dark:text-brand-400' : 'text-stone-900 dark:text-stone-100'}`}>
                  {p.price}
                </span>
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
