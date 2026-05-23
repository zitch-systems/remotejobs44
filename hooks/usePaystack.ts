// hooks/usePaystack.ts — Client-side Paystack redirect flow
// No react-paystack needed — we use Paystack's hosted payment page
'use client';
import { useState } from 'react';
import { useUIStore } from '@/lib/store';

interface PayOptions {
  plan: 'daily' | 'pro' | 'pro_annual';
}

export function usePaystack() {
  const [loading, setLoading] = useState(false);
  const { toast } = useUIStore();

  async function pay({ plan }: PayOptions) {
    setLoading(true);
    try {
      const res = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error ?? 'Payment initialization failed');
      }

      // Redirect to Paystack's hosted payment page
      window.location.href = data.authorizationUrl;
    } catch (err: any) {
      toast(err.message, 'error');
      setLoading(false);
    }