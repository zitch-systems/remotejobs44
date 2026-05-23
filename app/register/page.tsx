'use client';
// app/register/page.tsx — Supabase email/password registration
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, UserPlus, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUIStore } from '@/lib/store';

function StrengthBar({ password }: { password: string }) {
  const checks = [
    { label: '8+ characters', pass: password.length >= 8 },
    { label: 'Uppercase',     pass: /[A-Z]/.test(password) },
    { label: 'Number',        pass: /\d/.test(password) },
  ];
  const score = checks.filter(c => c.pass).length;
  const colors = ['', 'bg-red-400', 'bg-amber-400', 'bg-brand-500'];
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1.5">
        {[0, 1, 2].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < score ? colors[score] : 'bg-stone-200 dark:bg-stone-700'}`} />
        ))}
      </div>
      <div className="flex gap-3 flex-wrap">
        {checks.map(c => (
          <span key={c.label} className={`flex items-center gap-1 text-xs ${c.pass ? 'text-brand-600 dark:text-brand-400' : 'text-stone-400'}`}>
            <Check className="w-3 h-3" />{c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
