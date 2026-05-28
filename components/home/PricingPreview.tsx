// components/home/PricingPreview.tsx
//
// Server component — the prices, features, and copy ship in the SSR
// HTML. Each card's "Pay" button is a tiny client island
// (PricingPreviewPayButton) that handles the usePaystack + auth-store
// check. The whole section was 'use client' previously, shipping ~6 KB
// of inert client JS for content that doesn't change after hydration.
import Link from 'next/link';
import { Check } from 'lucide-react';
import { PricingPreviewPayButton } from './PricingPreviewPayButton';

const PLANS = [
  {
    id:        'daily'      as const,
    name:      'Day Pass',
    price:     '₦500',
    period:    '/ 24 hours',
    desc:      'Full access for a day. Great for an active job hunt.',
    features:  ['Up to 10 job applications', 'All apply links & emails', 'CV auto-apply', '24-hour access'],
    cta:       'Get Day Pass',
    highlight: false,
    badge:     null as string | null,
  },
  {
    id:        'pro'        as const,
    name:      'Pro Monthly',
    price:     '₦2,999',
    period:    '/ month',
    desc:      'Unlimited access, ongoing alerts, and priority support.',
    features:  ['Everything in Day Pass', 'Ongoing job alerts', 'Priority support', 'Cancel anytime'],
    cta:       'Get Pro',
    highlight: true,
    badge:     'Most Popular' as string | null,
  },
  {
    id:        'pro_annual' as const,
    name:      'Pro Annual',
    price:     '₦29,999',
    period:    '/ year',
    desc:      'Best value — save ₦5,989 vs monthly.',
    features:  ['Everything in Pro Monthly', 'Save ₦5,989/yr', 'Early feature access', 'Priority support'],
    cta:       'Get Annual',
    highlight: false,
    badge:     'Best Value' as string | null,
  },
];

export function PricingPreview() {
  return (
    <section className="py-20 bg-stone-50 dark:bg-[#0f1e38]">
      <div className="max-w-[1440px] mx-auto px-5">

        {/* Heading */}
        <div className="text-center mb-10">
          <h2 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight mb-3">
            Flexible plans for everyone
          </h2>
          <p className="text-stone-400 dark:text-stone-500 max-w-md mx-auto text-sm">
            Start free, upgrade when you&apos;re ready. Access from just ₦500.
          </p>
        </div>

        {/* Free strip */}
        <div className="bg-white dark:bg-[#0d1a2e] border border-stone-200 dark:border-[#1e3a5f] rounded-xl p-4 flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <p className="font-bold text-sm text-stone-900 dark:text-stone-100">Free Plan</p>
            <p className="text-xs text-stone-400 dark:text-stone-500">Browse all jobs, save favourites, explore companies — no card needed.</p>
          </div>
          <Link href="/register"
            className="px-5 py-2.5 border border-stone-200 dark:border-[#1e3a5f] rounded-xl text-sm font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
            Start for Free →
          </Link>
        </div>

        {/* Paid plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white dark:bg-[#0d1a2e] border rounded-xl flex flex-col p-6 transition-all duration-200 ${
                plan.highlight
                  ? 'border-brand-600 dark:border-brand-500'
                  : 'border-stone-200 dark:border-[#1e3a5f]'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-display font-bold text-lg text-stone-900 dark:text-stone-100">{plan.name}</p>
                  <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{plan.desc}</p>
                </div>
                {plan.badge && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ml-2 ${
                      plan.highlight
                        ? 'bg-brand-700 dark:bg-brand-500 text-white'
                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {plan.badge}
                  </span>
                )}
              </div>

              <div className="mb-5">
                <span className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100">{plan.price}</span>
                <span className="text-stone-400 dark:text-stone-500 text-sm ml-1">{plan.period}</span>
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-stone-600 dark:text-stone-300">
                    <Check className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <PricingPreviewPayButton planId={plan.id} label={plan.cta} highlight={plan.highlight} />
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-stone-400 dark:text-stone-500 mt-6">
          Secure payment via Paystack · Cancel anytime · No hidden fees
        </p>
      </div>
    </section>
  );
}
