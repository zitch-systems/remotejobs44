// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format } from 'date-fns';
import type { JobCategory } from './types';

// Proper Tailwind class merging — resolves conflicts (e.g. p-2 + p-4 → p-4)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeDate(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

export function formatDate(dateStr: string, fmt = 'MMM d, yyyy'): string {
  try {
    return format(new Date(dateStr), fmt);
  } catch {
    return dateStr;
  }
}

export function formatSalary(min?: number, max?: number, currency = 'USD'): string {
  if (!min && !max) return '';
  const sym: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$' };
  const s = sym[currency] ?? currency + ' ';
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
  if (min && max) return `${s}${fmt(min)}–${fmt(max)}/yr`;
  if (min) return `${s}${fmt(min)}+/yr`;
  return `Up to ${s}${fmt(max!)}/yr`;
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export function truncate(str: string, len = 120): string {
  return str && str.length > len ? str.slice(0, len) + '…' : str;
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

export function capitalize(str: string): string {
  return str ? str[0].toUpperCase() + str.slice(1) : '';
}

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export const CATEGORY_META: Record<JobCategory | 'all', { label: string; icon: string; color: string }> = {
  all:          { label: 'All Jobs',     icon: '🌐', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  engineering:  { label: 'Engineering',  icon: '💻', color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  design:       { label: 'Design',       icon: '🎨', color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  marketing:    { label: 'Marketing',    icon: '📈', color: 'bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' },
  finance:      { label: 'Finance',      icon: '💰', color: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  sales:        { label: 'Sales',        icon: '🤝', color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  data:         { label: 'Data',         icon: '📊', color: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
  hr:           { label: 'HR',           icon: '👥', color: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
  product:      { label: 'Product',      icon: '📦', color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  legal:        { label: 'Legal',        icon: '⚖️', color: 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  operations:   { label: 'Operations',   icon: '⚙️', color: 'bg-zinc-50 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
  other:        { label: 'Other',        icon: '✨', color: 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
};

export const SOURCE_META = {
  rss:           { label: 'RSS Feed',     icon: '📡', color: 'text-amber-600 dark:text-amber-400' },
  scrape:        { label: 'Web Scrape',   icon: '🕸️', color: 'text-violet-600 dark:text-violet-400' },
  manual:        { label: 'Posted',       icon: '✍️',  color: 'text-brand-700 dark:text-brand-400' },
  'embedded-rss':{ label: 'Partner RSS',  icon: '🔗', color: 'text-blue-600 dark:text-blue-400' },
  'custom-rss':  { label: 'Custom RSS',   icon: '📻', color: 'text-orange-600 dark:text-orange-400' },
  api:           { label: 'API',          icon: '⚡', color: 'text-brand-600 dark:text-brand-400' },
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateUrl(url: string): boolean {
  try { new URL(url); return true; } catch { return false; }
}

export const LANG_META: Record<string, { flag: string; name: string; dir: 'ltr' | 'rtl' }> = {
  en: { flag: '🇺🇸', name: 'English', dir: 'ltr' },
  fr: { flag: '🇫🇷', name: 'Français', dir: 'ltr' },
  es: { flag: '🇪🇸', name: 'Español', dir: 'ltr' },
  de: { flag: '🇩🇪', name: 'Deutsch', dir: 'ltr' },
  pt: { flag: '🇧🇷', name: 'Português', dir: 'ltr' },
  ar: { flag: '🇦🇪', name: 'العربية', dir: 'rtl' },
  zh: { flag: '🇨🇳', name: '中文', dir: 'ltr' },
  ja: { flag: '🇯🇵', name: '日本語', dir: 'ltr' },
};
