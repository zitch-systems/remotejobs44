import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow } from 'date-fns';
import type { JobCategory, JobSourceType } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSalary(min?: number, max?: number, currency = 'NGN'): string {
  if (!min && !max) return 'Not specified';
  const fmt = (n: number) =>
    currency === 'NGN' ? `₦${n.toLocaleString()}` : `$${n.toLocaleString()}`;
  if (min && max && min !== max) return `${fmt(min)} - ${fmt(max)}`;
  return fmt(min ?? max ?? 0);
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function formatRelativeDate(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const CATEGORY_META: Record<JobCategory, { label: string; emoji: string }> = {
  engineering: { label: 'Engineering', emoji: '⚙️' },
  design: { label: 'Design', emoji: '🎨' },
  marketing: { label: 'Marketing', emoji: '📣' },
  finance: { label: 'Finance', emoji: '💰' },
  sales: { label: 'Sales', emoji: '🤝' },
  data: { label: 'Data', emoji: '📊' },
  hr: { label: 'HR', emoji: '👥' },
  product: { label: 'Product', emoji: '🚀' },
  legal: { label: 'Legal', emoji: '⚖️' },
  operations: { label: 'Operations', emoji: '🔧' },
  other: { label: 'Other', emoji: '📦' },
};

export const SOURCE_META: Record<JobSourceType, { label: string; color: string; icon: string }> = {
  rss: { label: 'RSS Feed', color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400', icon: '📡' },
  scrape: { label: 'Web Scraped', color: 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400', icon: '🕷️' },
  manual: { label: 'Manual', color: 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-400', icon: '✋' },
  'embedded-rss': { label: 'Embedded RSS', color: 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400', icon: '🔗' },
  'custom-rss': { label: 'Custom RSS', color: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400', icon: '⚙️' },
  api: { label: 'API', color: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400', icon: '🔌' },
};

// Simple unique ID generator
export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

