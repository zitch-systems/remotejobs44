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
export const MASKED_RECENT_COMPANY = 'Hidden Company';
export const MASKED_RECENT_GRADIENT: [string, string] = ['#475569', '#64748b'];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Remove employer identity before a configured app persists a recent job. */
export function maskRecentRole(role: string, company: string): string {
  const name = company.trim();
  if (!name) return role;
  // Very short employer names collide with ordinary text, so keep no title
  // snapshot when they occur in the title rather than risk persisting identity.
  if (name.length < 3) {
    return role.toLocaleLowerCase().includes(name.toLocaleLowerCase()) ? 'Recently viewed role' : role;
  }
  const variants = new Set([name]);
  const base = name.replace(/[,.]?\s+(inc|llc|ltd|limited|gmbh|corp|corporation|co)\.?$/i, '').trim();
  if (base.length >= 3) variants.add(base);
  let masked = role;
  for (const variant of variants) {
    const lead = /^\w/.test(variant) ? '\\b' : '';
    const tail = /\w$/.test(variant) ? '\\b' : '';
    masked = masked.replace(new RegExp(`${lead}${escapeRegExp(variant)}${tail}`, 'gi'), MASKED_RECENT_COMPANY);
  }
  return masked;
}

export function toRecent(j: Job, maskEmployer = false): RecentJob {
  if (maskEmployer) {
    return {
      id: j.id,
      role: maskRecentRole(j.role, j.company),
      company: MASKED_RECENT_COMPANY,
      logo: '?',
      grad: MASKED_RECENT_GRADIENT,
      salary: j.salary,
      per: j.per,
      verified: j.verified,
    };
  }
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

/** Version 0 stored raw Pro employer identity; it must never be rehydrated. */
export function migrateRecentState(persisted: unknown, version: number): unknown {
  if (version < 1) return { items: [] };
  return persisted;
}

/** Configured builds never restore device history into a fresh auth process. */
export function mergeRecentState<State extends object>(persisted: unknown, current: State, configured: boolean): State {
  if (configured || !persisted || typeof persisted !== 'object') return current;
  return { ...current, ...persisted };
}

/** Prepend (most-recent first), dedupe by id, cap the length. */
export function pushRecent(list: RecentJob[], item: RecentJob, cap: number = RECENT_CAP): RecentJob[] {
  return [item, ...list.filter((r) => r.id !== item.id)].slice(0, cap);
}
