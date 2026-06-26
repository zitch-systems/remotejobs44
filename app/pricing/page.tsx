'use client';
// app/pricing/page.tsx
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Check, X, Zap, Clock, Calendar, PartyPopper } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { usePaystack } from '@/hooks/usePaystack';
import { createClient, getAuthedUserSafe } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { resolveRole } from '@/lib/auth/redirect';
import { resolvePlan } from '@/lib/auth/plan';

const PLANS = [
  {
    id: 'free' as const,
    name: 'Free',
    price: '₦0',
    period: 'forever',
    originalPrice: null,
    save: null,
    icon: null,
    desc: 'Browse jobs and apply free for your first week.',
    cta: 'Start Free',
    popular: false,
    features: [
      { text: 'Browse all 50,000+ remote jobs', ok: true },
      { text: '3 free applications in your first week', ok: true },
      { text: 'Basic search & filters', ok: true },
      { text: 'Save up to 5 jobs', ok: true },
      { text: 'Company profiles', ok: true },
      { text: 'CV upload & auto-apply', ok: false },
      { text: 'Application tracker', ok: false },
      { text: 'Job alerts & notifications', ok: false },
    ],
  },
  {
    id: 'daily' as const,
    name: 'Day Pass',
    price: '₦500',
    period: '/ 24 hours',
    originalPrice: '₦2,000',
    save: '75%',
    icon: <Clock className="w-4 h-4" />,
    desc: 'Full access for 24 hours with 10 applications. Perfect for a focused job-hunt day.',
    cta: 'Get Day Pass',
    popular: false,
    features: [
      { text: 'Everything in Free', ok: true },
      { text: 'Up to 10 job applications', ok: true },
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
    price: '₦2,999',
    period: '/ month',
    originalPrice: '₦8,999',
    save: '67%',
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
    price: '₦29,999',
    period: '/ year',
    originalPrice: '₦89,999',
    save: '67%',
    icon: <Calendar className="w-4 h-4" />,
    desc: 'Best value — save ₦5,989 compared to monthly.',
    cta: 'Get Annual',
    popular: false,
    features: [
      { text: 'Everything in Pro Monthly', ok: true },
      { text: 'Save ₦5,989 per year', ok: true },
      { text: 'Early access to new features', ok: true },
      { text: 'Priority support', ok: true },
      { text: 'Cancel anytime', ok: true },
      { text: 'Renews annually', ok: true },
      { text: 'Dedicated account manager', ok: false },
      { text: 'API access', ok: false },
    ],
  },
];

function PricingContent() {
  const searchParams = useSearchParams();
  const { user, isPro, isLoggedIn, setUser } = useAuthStore();
  const { pay, loading } = usePaystack();
  const [activePlan, setActivePlan] = useState<string | null>(null);
  const [successPlan, setSuccessPlan] = useState<string | null>(null);

  useEffect(() => {
    const success = searchParams.get('success');
    const plan    = searchParams.get('plan');
    if (success !== '1' || !plan) return;

    setSuccessPlan(plan);

    // Optimistically reflect the just-purchased plan in Zustand so the rest
    // of the UI (Header badge, dashboard, "Current Plan" markers) flips to
    // subscribed instantly. The poll below will reconcile against the DB once
    // the webhook has stamped profile.plan.
    // pro_annual + pro_monthly both bill as 'pro' in our schema.
    const optimisticPlan: 'daily' | 'pro' =
      plan === 'daily' ? 'daily' : 'pro';
    const { updateUser } = useAuthStore.getState();
    updateUser({ plan: optimisticPlan });

    // Poll Supabase until the plan is updated in DB (retry up to 10x, 1s apart).
    // The key invariant: while we're waiting for the webhook, we MUST NOT
    // stamp profile.plan='free' back into Zustand — that's exactly the
    // "subscribed → unsubscribed → subscribed" flicker.
    let attempts = 0;
    const maxAttempts = 10;

    async function syncProfile() {
      try {
        const supabase = createClient();
        // Use getAuthedUserSafe so a transient 401 during a post-redirect
        // token refresh doesn't silently kill the poll — that left the
        // user stuck on the optimistic plan with no DB reconciliation.
        const { user: authUser, status } = await getAuthedUserSafe(supabase);
        if (status === 'unauthed' || !authUser) return;
        if (status === 'transient') {
          if (attempts < maxAttempts) { attempts++; setTimeout(syncProfile, 1000); }
          return;
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('name,plan,role,created_at,profile_completion,plan_expires_at')
          .eq('id', authUser.id)
          .maybeSingle();

        // Profile lookup failed (RLS, transient, network) — don't downgrade
        // the user's in-memory plan to 'free'. Just retry until we get an
        // answer or give up after maxAttempts.
        if (error || !profile) {
          if (attempts < maxAttempts) {
            attempts++;
            setTimeout(syncProfile, 1000);
          }
          return;
        }

        const role = resolveRole({ profileRole: profile.role, email: authUser.email });
        const expiryMs = profile.plan_expires_at ? new Date(profile.plan_expires_at).getTime() : null;
        const hasFutureExpiry = expiryMs !== null && expiryMs >= Date.now();

        // Keep polling as long as the DB still says 'free' AND we don't yet
        // have proof of payment via plan_expires_at. Once the verify route
        // OR the webhook lands, one of those two will flip.
        const rawDbPlan = role === 'admin' ? 'admin' : (profile.plan ?? 'free');
        if (rawDbPlan === 'free' && !hasFutureExpiry && plan !== 'free' && attempts < maxAttempts) {
          attempts++;
          setTimeout(syncProfile, 1000);
          return;
        }

        const finalPlan = resolvePlan({
          role,
          dbPlan: profile.plan,
          planExpiresAt: profile.plan_expires_at,
          currentClientPlan: optimisticPlan,
        });

        setUser({
          id:    authUser.id,
          email: authUser.email!,
          name:  profile.name ?? authUser.email!.split('@')[0],
          plan:  finalPlan,
          role,
          joinedAt: profile.created_at ?? new Date().toISOString(),
          profileCompletion: profile.profile_completion ?? 20,
        });
      } catch {
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(syncProfile, 1000);
        }
      }
    }

    syncProfile();
  }, []);

  const currentPlan = user?.plan ?? 'free';

  function isCurrent(planId: string) {
    if (planId === 'free')       return currentPlan === 'free';
    if (planId === 'daily')      return currentPlan === 'daily';
    if (planId === 'pro')        return currentPlan === 'pro';
    if (planId === 'pro_annual') return currentPlan === 'pro'; // annual bills as 'pro'
    return false;
  }

  async function handleSubscribe(planId: string) {
    if (planId === 'free') { window.location.href = isLoggedIn() ? '/dashboard' : '/register'; return; }
    if (!isLoggedIn()) { window.location.href = `/login?next=/pricing`; return; }
    if (isCurrent(planId) || activePlan) return;   // prevent double-click
    setActivePlan(planId);
    // pay() redirects away on success — only reset if there's an error (handled inside pay)
    await pay({ plan: planId as 'daily' | 'pro' | 'pro_annual' });
    // Only reaches here on error (redirect didn't happen)
    setActivePlan(null);
  }

  return (
    <div className="max-w-[1200px] mx-auto px-5 py-16">
      {/* Payment success banner */}
      {successPlan && (
        <div className="mb-10 flex items-center gap-3 p-5 rounded-2xl bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 text-brand-800 dark:text-brand-300">
          <PartyPopper className="w-6 h-6 shrink-0 text-brand-600 dark:text-brand-400" />
          <div>
            <p className="font-bold text-base">Payment successful — welcome to {successPlan === 'daily' ? 'Day Pass' : successPlan === 'pro_annual' ? 'Pro Annual' : 'Pro'}!</p>
            <p className="text-sm opacity-80 mt-0.5">Your account has been upgraded. <Link href="/dashboard" className="underline font-semibold">Go to dashboard →</Link></p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-14">
        <h1 className="font-display font-extrabold text-4xl md:text-5xl text-stone-900 dark:text-stone-100 tracking-tight mb-4">
          Plans for every job seeker
        </h1>
        <p className="text-stone-400 dark:text-stone-500 text-lg max-w-xl mx-auto">
          Browse free forever and get 3 free applications your first week. Upgrade for unlimited applies, auto-apply, and tracking. Start from just ₦500.
        </p>
      </div>

      {/* Limited-time promo banner — reinforces the struck-through anchor prices below */}
      <div className="flex justify-center mb-12">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent text-xs font-bold uppercase tracking-wider">
          <PartyPopper className="w-4 h-4" />
          Limited-time launch promo · save up to 75%
        </span>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-16">
        {PLANS.map(plan => {
          const isActive = activePlan === plan.id;
          const planIsCurrent = isCurrent(plan.id);
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
                {plan.originalPrice && (
                  // Promo anchor: the pre-promo "was" price struck through, plus
                  // the discount %, so the live price reads as a deal. Display
                  // only — the actual Paystack charge is unchanged (the real
                  // amounts live in lib/paystack/plans.ts → PLAN_AMOUNTS_KOBO).
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-stone-400 dark:text-stone-500 line-through">{plan.originalPrice}</span>
                    {plan.save && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-bold uppercase tracking-wider">
                        Save {plan.save}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100">{plan.price}</span>
                </div>
                <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{plan.period}</p>
                {plan.id === 'pro_annual' && (
                  // Per-month framing for the annual plan (₦29,999 / 12 ≈ ₦2,500).
                  // Kept as a guarded regression check in tests/e2e/pricing.spec.ts.
                  <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
                    <span className="text-accent font-semibold">= ₦2,500/mo</span>
                  </p>
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
                disabled={isActive || planIsCurrent || (activePlan !== null && !isActive)}
                className={cn(
                  'w-full py-3 rounded-xl font-bold text-sm transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
                  plan.id === 'free'
                    ? 'border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#162033]'
                    : plan.popular
                    ? 'bg-brand-700 dark:bg-brand-500 text-white hover:bg-brand-600 dark:hover:bg-brand-400'
                    : 'border border-brand-600 dark:border-brand-500 text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20'
                )}
              >
                {isActive
                  ? <span className="flex items-center justify-center gap-2"><span className="inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />Processing…</span>
                  : planIsCurrent ? '✓ Current Plan'
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
            { q: 'What is the Day Pass?', a: 'A one-time payment of ₦500 that gives you full Pro access for exactly 24 hours, with up to 10 job applications. Great if you want to spend a focused day applying to jobs.' },
            { q: 'How does auto-apply work?', a: 'Upload your CV once in your profile. For jobs that support it, we pre-fill the application form and submit it with one tap.' },
            { q: 'Can I cancel my monthly subscription?', a: 'Yes — cancel anytime from your dashboard. You keep access until the end of your current billing period.' },
            { q: 'What payment methods does Paystack support?', a: 'All major debit/credit cards, bank transfers, USSD, and mobile money. Fully encrypted and PCI-compliant.' },
            { q: 'Is there a free trial?', a: 'Yes — every new account gets 3 free job applications during its first week. After that (or once you\'ve used all 3), upgrade to a paid plan to keep applying. Browsing stays free forever.' },
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

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="max-w-6xl mx-auto px-5 py-12 animate-pulse">
        <div className="skeleton h-10 w-64 rounded mx-auto mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-96 rounded-2xl" />)}
        </div>
      </div>
    }>
      <PricingContent />
    </Suspense>
  );
}
