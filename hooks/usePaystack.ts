// hooks/usePaystack.ts — Client-side Paystack payment hook
// Usage: const { pay, loading } = usePaystack()
// Then: pay({ plan: 'pro', billing: 'monthly' })
'use client';
import { useState } from 'react';
import { useUIStore } from '@/lib/store';

interface PayOptions {
  plan: 'daily' | 'pro';
  billing: 'daily' | 'monthly' | 'annually';
  currency?: string;
}

export function usePaystack() {
  const [loading, setLoading] = useState(false);
  const { toast } = useUIStore();

  async function pay({ plan, billing, currency = 'NGN' }: PayOptions) {
    setLoading(true);
    try {
      const res = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billing, currency }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error ?? 'Payment initialization failed');
      }

      // Redirect to Paystack hosted payment page
      // User pays → Paystack redirects back to /api/paystack/verify
      window.location.href = data.authorizationUrl;
    } catch (err: any) {
      toast(err.message, 'error');
      setLoading(false);
    }
  }

  return { pay, loading };
}
