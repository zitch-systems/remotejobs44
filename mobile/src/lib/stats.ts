// src/lib/stats.ts — pure helpers for the Applications insights + status filter.
import type { AppStatus } from './types';

export interface ApplicationStats {
  total: number;
  active: number; // applied + screening
  interviewing: number; // interview + offer
  offers: number; // offer
  closed: number; // rejected + withdrawn
  responseRate: number; // % that drew a response (screening / interview / offer)
}

export function applicationStats(applied: Record<string, AppStatus>): ApplicationStats {
  const vals = Object.values(applied);
  const total = vals.length;
  const has = (...ss: AppStatus[]) => vals.filter((s) => ss.includes(s)).length;
  const responded = has('screening', 'interview', 'offer');
  return {
    total,
    active: has('applied', 'screening'),
    interviewing: has('interview', 'offer'),
    offers: has('offer'),
    closed: has('rejected', 'withdrawn'),
    responseRate: total ? Math.round((responded / total) * 100) : 0,
  };
}

export type StatusFilter = 'all' | 'active' | 'interviewing' | 'offers' | 'closed';

export const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'interviewing', label: 'Interviewing' },
  { key: 'offers', label: 'Offers' },
  { key: 'closed', label: 'Closed' },
];

export function inStatusFilter(status: AppStatus, f: StatusFilter): boolean {
  switch (f) {
    case 'active':
      return status === 'applied' || status === 'screening';
    case 'interviewing':
      return status === 'interview' || status === 'offer';
    case 'offers':
      return status === 'offer';
    case 'closed':
      return status === 'rejected' || status === 'withdrawn';
    case 'all':
    default:
      return true;
  }
}
