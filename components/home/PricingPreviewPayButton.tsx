'use client';
// components/home/PricingPreviewPayButton.tsx
//
// Tiny client island for the Pay button on the homepage pricing cards.
// The rest of PricingPreview is server-rendered — only the button needs
// the auth-store check + usePaystack hook.
import { usePaystack } from '@/hooks/usePaystack';
import { useAuthStore } from '@/lib/store';

export function PricingPreviewPayButton({
  planId,
  label,
  highlight,
}: {
  planId: 'daily' | 'pro' | 'pro_annual';
  label: string;
  highlight: boolean;
}) {
  const { pay, loading } = usePaystack();
  const isLoggedIn = useAuthStore(s => s.isLoggedIn);

  async function handleClick() {
    if (!isLoggedIn()) {
      window.location.href = '/register';
      return;
    }
    await pay({ plan: planId });
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`w-full py-3 rounded-xl font-bold text-sm transition-all duration-150 disabled:opacity-60 ${
        highlight
          ? 'bg-brand-700 dark:bg-brand-500 text-white hover:bg-brand-600 dark:hover:bg-brand-400'
          : 'border border-brand-600 dark:border-brand-500 text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20'
      }`}
    >
      {loading ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
          Processing…
        </span>
      ) : label}
    </button>
  );
}
