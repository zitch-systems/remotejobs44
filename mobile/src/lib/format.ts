// src/lib/format.ts — pure, dependency-free helpers shared by the data layer.
// Kept free of React/Supabase imports so they can be unit-tested directly
// (see format.test.ts).
import type { AppStatus, Job, JobTag } from './types';

// Deterministic company-tile gradients (picked per company name).
export const GRADS: [string, string][] = [
  ['#0f172a', '#334155'],
  ['#0ea5e9', '#1d4ed8'],
  ['#f97316', '#ea580c'],
  ['#7c3aed', '#4f46e5'],
  ['#1ea05e', '#0f766e'],
  ['#db2777', '#9d174d'],
  ['#0891b2', '#0e7490'],
  ['#ca8a04', '#a16207'],
];

export function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function gradFor(company: string): [string, string] {
  return GRADS[hash(company) % GRADS.length];
}

const CUR: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€', KES: 'KSh', ZAR: 'R', GHS: '₵' };

export function money(n: number, currency: string): string {
  const sym = CUR[currency] ?? `${currency} `;
  if (n >= 1_000_000) return `${sym}${+(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}m`;
  if (n >= 1_000) return `${sym}${Math.round(n / 1_000)}k`;
  return `${sym}${n}`;
}

export function salaryLabel(min: number | null, max: number | null, currency: string): string {
  const cur = currency || 'USD';
  if (max) return money(max, cur);
  if (min) return money(min, cur);
  return 'Competitive';
}

export function timeAgo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'recently';
  const diff = now - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function tagsFrom(skills: string[] | null, category: string | null): JobTag[] {
  const base = (skills && skills.length ? skills : category ? [category] : []).slice(0, 3);
  return base.map((label, i) => ({ label, variant: i === 0 ? 'blue' : 'default' }));
}

export function bulletsFrom(requirements: string[] | string | null, description: string | null): string[] {
  // Live `requirements` is a text[]; use its items directly when present.
  if (Array.isArray(requirements)) {
    const items = requirements.map((s) => String(s).trim()).filter((s) => s.length > 0);
    if (items.length) return items.slice(0, 4);
  }
  const src = ((typeof requirements === 'string' ? requirements : '') || description || '').trim();
  if (!src) return ['Collaborate with a distributed team to ship meaningful work.'];
  const parts = src
    .split(/\n|•|·|;|(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.replace(/^[\s\-*•]+/, '').trim())
    .filter((s) => s.length > 12);
  return parts.slice(0, 4);
}

// Minimal shape deriveMatch needs (JobRow satisfies it structurally).
export interface ScoreSignals {
  id: string;
  skills: string[] | null;
  salary_min: number | null;
  salary_max: number | null;
  posted_at: string | null;
  featured: boolean | null;
}

// Match score from real job signals (skill richness, salary transparency,
// recency, featured) + a small deterministic spread. Stable per job.
export function deriveMatch(r: ScoreSignals, now: number = Date.now()): number {
  let score = 76;
  score += Math.min(12, (r.skills?.length ?? 0) * 2);
  if (r.salary_min || r.salary_max) score += 4;
  if (r.posted_at) {
    const days = (now - new Date(r.posted_at).getTime()) / 86_400_000;
    if (days <= 7) score += 4;
    else if (days <= 30) score += 2;
  }
  if (r.featured) score += 3;
  score += (hash(r.id) % 5) - 2;
  return Math.max(70, Math.min(98, score));
}

export function verdictFor(match: number): { verdict: string; vcap: string } {
  if (match >= 88) return { verdict: 'You match almost everything here', vcap: 'Your profile lines up with the core requirements.' };
  if (match >= 80) return { verdict: 'A strong fit worth a look', vcap: 'Most of your skills map to this role.' };
  return { verdict: 'A fair match', vcap: 'Some of your experience transfers to this role.' };
}

// Boost match by overlap with the user's skills (capped). No-op when empty.
export function personalizeJobs(jobs: Job[], userSkills: string[]): Job[] {
  if (!userSkills.length) return jobs;
  const set = new Set(userSkills.map((s) => s.toLowerCase()));
  return jobs.map((j) => {
    const overlap = j.skills.filter((s) => set.has(s.toLowerCase())).length;
    if (!overlap) return j;
    return { ...j, match: Math.min(99, j.match + Math.min(8, overlap * 3)) };
  });
}

// applications.status enum → the 3-state mobile tracker.
export function dbToStatus(s: string): AppStatus {
  if (s === 'screening') return 'review';
  if (s === 'interview' || s === 'offer') return 'interview';
  return 'applied'; // applied | rejected | withdrawn
}

// The public invite URL the web resolves to attribute a signup (?ref / /r/).
export function referralLink(code: string): string {
  return `https://remotejobs44.com/r/${encodeURIComponent(code)}`;
}

export interface RewardProgress {
  remaining: number; // invites still needed to unlock the reward
  pct: number; // 0..100 progress toward the goal
  reached: boolean; // goal met (reward unlocked)
}

// Progress toward the invite reward (e.g. 1 month of Pro at goal invites).
export function rewardProgress(count: number, goal: number): RewardProgress {
  const c = Math.max(0, Math.floor(count || 0));
  const g = Math.max(1, Math.floor(goal || 1));
  return {
    remaining: Math.max(0, g - c),
    pct: Math.min(100, Math.round((c / g) * 100)),
    reached: c >= g,
  };
}
