'use client';
// components/home/PricingPreview.tsx — homepage pricing teaser
import Link from 'next/link';
import { Check } from 'lucide-react';
import { usePaystack } from '@/hooks/usePaystack';
import { useAuthStore } from '@/lib/store';

const PLANS = [
  {
    id: 'daily' as const,
    name: 'Day Pass',
    price: '₦1,000',
    period: '/ 24 hours',
    desc: 'Try full access for a day. Perfect for an active job hunt.',
    features: ['All apply links & emails', 'CV auto-apply', 'Application tracker', 'One-day access'],
    cta: 'Get Day Pass',
    highlight: false,
    badge: null,
  },
  {
    id: 'pro' as const,
    name: 'Pro Monthly',
    price: '₦8,999',
    period: '/ month',
    desc: 'Unlimited access, ongoing alerts, and priority support.',
    features: ['Everything in Day Pass', 'Ongoing job alerts', 'Priority support', 'Cancel anytime'],
    cta: 'Get Pro',
    highlight: true,
    badge: 'Most Popular',
  },
  {
    id: 'pro_annual' as const,
    name: 'Pro Annual',
    price: '₦89,999',
    period: '/ year',
    desc: 'Best value — save ₦17,989 vs monthly.',
    features: ['Everything in Pro Monthly', 'Save ₦17,989/year', 'Early feature access', 'Priority support'],
    cta: 'Get Annual',
    highlight: false,
    badge: 'Best Value',
  },
];

export function PricingPreview() {
  const { pay, loading } = usePaystack();
  const { isLoggedIn } = useAuthStore();

  async function handlePay(planId: 'daily' | 'pro' | 'pro_annual') {
    if (!isLoggedIn()) { window.location.href = '/register'; return; }
    await pay({ plan: planId });
  }

  return (
    <section className="py-20 bg-stone-50 dark:bg-[#0D1F18]">
      <div className="max-w-[1240px] mx-auto px-5">
        <div className="text-center mb-12">
          <h2 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight mb-3">
            Flexible plans for everyone
          </h2>
          <p className="text-stone-400 dark:text-stone-500 max-w-md mx-auto">
            Start free, upgrade when you're ready. Access from just ₦1,000.
          </p>
        </div>

        {/* Free plan strip */}
        <div className="card p-4 flex items-center justify-between flex-wrap gap-4 mb-6 bg-white dark:bg-[#152B20]">
          <div>
            <p className="font-bold text-sm text-stone-900 dark:text-stone-100">Free Plan</p>
            <p className="text-xs text-stone-400 dark:text-stone-500">Browse all jobs, save favourites, explore companies — no card needed.</p>
          </div>
          <Link href="/register" className="px-5 py-2.5 border border-stone-200 dark:border-[#234533] rounded-xl text-sm font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#1C3829] transition-colors">
            Start for Free →
          </Link>
        </div>

        {/* Paid plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map(plan => (
            <div key={plan.id} className={`card flex flex-col p-6 transition-all duration-200 ${plan.highlight ? 'border-brand-600 dark:border-brand-500 shadow-md-brand' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-display font-bold text-lg text-stone-900 dark:text-stone-100">{plan.name}</p>
                  <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{plan.desc}</p>
                </div>
                {plan.badge && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ml-2 ${plan.highlight ? 'bg-brand-700 dark:bg-brand-500 text-white' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                    {plan.badge}
                  </span>
                )}
              </div>

              <div className="mb-5">
                <span className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100">{plan.price}</span>
                <span className="text-stone-400 dark:text-stone-500 text-sm ml-1">{plan.period}</span>
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-stone-600 dark:text-stone-300">
                    <Check className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handlePay(plan.id)}
                disabled={loading}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all duration-150 disabled:opacity-60 ${
                  plan.highlight
                    ? 'bg-brand-700 dark:bg-brand-500 text-white hover:bg-brand-600 dark:hover:bg-brand-400'
                    : 'border border-brand-600 dark:border-brand-500 text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20'
                }`}
              >
                {loading ? '…' : plan.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-stone-400 dark:text-stone-500 mt-6">
          All plans include secure payment via Paystack · Cancel anytime
        </p>
      </div>
    </section>
  );
}
