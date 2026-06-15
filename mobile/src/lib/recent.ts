// src/lib/recent.ts — pure helpers + type for "recently viewed" jobs.
// A compact snapshot is stored (enough to render a mini card + navigate), kept
// out of the store/component so the list logic can be unit-tested.
import type { Job } from './types';

export interface RecentJob {
  id: string;
  role: string;
  company: string;
  logo: string; // initial for the gradient tile
  grad: [string, string];
  logoUrl?: string;
  salary: string;
  per: string;
  verified: boolean;
}

export const RECENT_CAP = 12;

export function toRecent(j: Job): RecentJob {
  return {
    id: j.id,
    role: j.role,
    company: j.company,
    logo: j.logo,
    grad: j.grad,
    logoUrl: j.logoUrl,
    salary: j.salary,
    per: j.per,
    verified: j.verified,
  };
}

/** Prepend (most-recent first), dedupe by id, cap the length. */
export function pushRecent(list: RecentJob[], item: RecentJob, cap: number = RECENT_CAP): RecentJob[] {
  return [item, ...list.filter((r) => r.id !== item.id)].slice(0, cap);
}
