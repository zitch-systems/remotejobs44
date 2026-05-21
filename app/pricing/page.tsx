'use client';
// app/pricing/page.tsx
import { useState } from 'react';
import Link from 'next/link';
import { Check, X, Zap, Clock, Calendar } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { usePaystack } from '@/hooks/usePaystack';
import { cn } from '@/lib/utils';

const PLANS = [
  {
    id: 'free' as const,
    name: 'Free',
    price: '₦0',
    period: 'forever',
    icon: null,
    desc: 'Browse jobs and explore opportunities.',
    cta: 'Start Free',
    popular: false,
    features: [
      { text: 'Browse all 50,000+ remote jobs', ok: true },
      { text: 'Basic search & filters', ok: true },
      { text: 'Save up to 5 jobs', ok: true },
      { text: 'Company profiles', ok: true },
      { text: 'Apply links & contact emails', ok: false },
      { text: 'CV upload & auto-apply', ok: false },
      { text: 'Application tracker', ok: false },
      { text: 'Job alerts & notifications', ok: false },
    ],
  },
  {
    id: 'daily' as const,
    name: 'Day Pass',
    price: '₦1,000',
    period: '/ 24 hours',
    icon: <Clock className="w-4 h-4" />,
    desc: 'Full access for 24 hours. Great for an active job-hunting day.',
    cta: 'Get Day Pass',
    popular: false,
    features: [
      { text: 'Everything in Free', ok: true },
      { text: 'All apply links & contact emails', ok: true },
      { text: 'CV upload & auto-apply', ok: true },
      { text: 'Full application tracker', ok: true },
      { text: 'Job alerts for 24 hours', ok: true },
      { text: 'Ongoing job alerts', ok: false },
      { text: 'Priority support', ok: false },
      { text: 'Renews automatically', ok: false },
    ],
  },
  {
    id: 'pro' as const,
    name: 'Pro Monthly',
    price: '₦8,999',
    period: '/ month',
    icon: <Zap className="w-4 h-4" />,
    desc: 'Everything you need to land your remote job, month after month.',
    cta: 'Get Pro',
    popular: true,
    features: [
      { text: 'Everything in Free', ok: true },
      { text: 'All apply links & contact emails', ok: true },
      { text: 'CV upload & auto-apply', ok: true },
      { text: 'Full application tracker', ok: true },
      { text: 'Ongoing job alerts', ok: true },
      { text: 'Priority support', ok: true },
      { text: 'Cancel anytime', ok: true },
      { text: 'Renews monthly', ok: true },
    ],
  },
  {
    id: 'pro_annual' as const,
    name: 'Pro Annual',
    price: '₦89,999',
    period: '/ year',
    icon: <Calendar className="w-4 h-4" />,
    desc: 'Best value — save ₦17,989 compared to monthly.',
    cta: 'Get Annual',
    popular: false,
    features: [
      { text: 'Everything in Pro Monthly', ok: true },
      { text: 'Save ₦17,989 per year', ok: true },
      { text: 'Early access to new features', ok: true },
      { text: 'Priority support', ok: true },
      { text: 'Cancel anytime', ok: true },
      { text: 'Renews annually', ok: true },
      { text: 'Dedicated account manager', ok: false },
      { text: 'API access', ok: false },
    ],
  },
];

export default function PricingPage() {
  const { isPro, isLoggedIn } = useAuthStore();
  const { pay, loading } = usePaystack();
  const [activePlan, setActivePlan] = useState<string | null>(null);

  async function handleSubscribe(planId: string) {
    if (planId === 'free') { window.location.href = '/register'; return; }
    if (!isLoggedIn()) { window.location.href = '/register'; return; }
    setActivePlan(planId);
    await pay({ plan: planId as 'daily' | 'pro' | 'pro_annual' });
    setActivePlan(null);
  }

  return (
    <div className="max-w-[1200px] mx-auto px-5 py-16">
      {/* Header */}
      <div className="text-center mb-14">
        <h1 className="font-display font-extrabold text-4xl md:text-5xl text-stone-900 dark:text-stone-100 tracking-tight mb-4">
          Plans for every job seeker
        </h1>
        <p className="text-stone-400 dark:text-stone-500 text-lg max-w-xl mx-auto">
          Browse free forever. Upgrade to unlock apply links, auto-apply, and tracking. Start from just ₦1,000.
        </p>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-16">
        {PLANS.map(plan => {
          const isActive = activePlan === plan.id;
          const isCurrent = isPro() && (plan.id === 'pro' || plan.id === 'pro_annual');
          return (
            <div key={plan.id} className={cn(
              'card flex flex-col p-6 transition-all duration-200 relative',
              plan.popular && 'border-brand-600 dark:border-brand-500 shadow-md-brand'
            )}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-brand-700 dark:bg-brand-500 text-white text-xs font-bold rounded-full whitespace-nowrap">
                  Most Popular
                </div>
              )}
              {plan.id === 'pro_annual' && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-amber-500 text-white text-xs font-bold rounded-full whitespace-nowrap">
                  Best Value
                </div>
              )}

              <div className="mb-5">
                <div className="flex items-center gap-2 mb-1">
                  {plan.icon && <span className="text-brand-600 dark:text-brand-400">{plan.icon}</span>}
                  <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100">{plan.name}</h2>
                </div>
                <p className="text-xs text-stone-400 dark:text-stone-500 leading-relaxed">{plan.desc}</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100">{plan.price}</span>
                </div>
                <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{plan.period}</p>
                {plan.id === 'pro_annual' && (
                  <p className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">= ₦7,500/mo</p>
                )}
              </div>

              <ul className="space-y-2.5 mb-7 flex-1">
                {plan.features.map(f => (
                  <li key={f.text} className={cn('flex items-start gap-2.5 text-xs', f.ok ? 'text-stone-600 dark:text-stone-300' : 'text-stone-300 dark:text-stone-600')}>
                    {f.ok
                      ? <Check className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" />
                      : <X className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                    {f.text}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={isActive || isCurrent}
                className={cn(
                  'w-full py-3 rounded-xl font-bold text-sm transition-all duration-150 disabled:opacity-60',
                  plan.id === 'free'
                    ? 'border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#162033]'
                    : plan.popular
                    ? 'bg-brand-700 dark:bg-brand-500 text-white hover:bg-brand-600 dark:hover:bg-brand-400'
                    : 'border border-brand-600 dark:border-brand-500 text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20'
                )}
              >
                {isActive
                  ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />Processing…</span>
                  : isCurrent ? 'Current Plan'
                  : plan.cta}
              </button>
            </div>
          );
        })}
      </div>

      {/* FAQ */}
      <div className="max-w-2xl mx-auto">
        <h2 className="font-display font-bold text-2xl text-stone-900 dark:text-stone-100 text-center mb-8">Common questions</h2>
        <div className="space-y-4">
          {[
            { q: 'What is the Day Pass?', a: 'A one-time payment of ₦1,000 that gives you full Pro access for exactly 24 hours. Great if you want to spend a focused day applying to jobs.' },
            { q: 'How does auto-apply work?', a: 'Upload your CV once in your profile. For jobs that support it, we pre-fill the application form and submit it with one tap.' },
            { q: 'Can I cancel my monthly subscription?', a: 'Yes — cancel anytime from your dashboard. You keep access until the end of your current billing period.' },
            { q: 'What payment methods does Paystack support?', a: 'All major debit/credit cards, bank transfers, USSD, and mobile money. Fully encrypted and PCI-compliant.' },
            { q: 'Is there a free trial?', a: 'The Free plan lets you browse everything with no time limit. Upgrade to a paid plan when you\'re ready to start applying.' },
          ].map(faq => (
            <div key={faq.q} className="card p-5">
              <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-2">{faq.q}</h3>
              <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
