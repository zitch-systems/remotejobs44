'use client';
// components/ui/ToastContainer.tsx
import { useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

const ICONS: Record<string, string> = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
const BORDERS: Record<string, string> = {
  success: 'border-l-4 border-l-brand-600',
  error:   'border-l-4 border-l-red-500',
  info:    'border-l-4 border-l-blue-500',
  warning: 'border-l-4 border-l-amber-500',
};

export function ToastContainer() {
  const { toasts, removeToast } = useUIStore();
  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[500] flex flex-col-reverse gap-2 w-[min(400px,90vw)] pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg pointer-events-auto animate-toast-in',
          'bg-white dark:bg-[#0d1a2e] border border-stone-200 dark:border-[#1e3a5f]',
          BORDERS[t.type]
        )}>
          <span className="text-lg shrink-0">{ICONS[t.type]}</span>
          <span className="text-sm font-medium text-stone-800 dark:text-stone-200 flex-1">{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>