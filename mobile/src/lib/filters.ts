// src/lib/filters.ts — pure, dependency-free job-filter logic shared by the
// Home feed and the Jobs tab. Kept out of components so it can be unit-tested
// directly (see filters.test.ts).
import type { Job } from './types';

export type ExperienceLevel = 'Any' | 'Entry' | 'Mid' | 'Senior' | 'Lead';

export const EXPERIENCE_LEVELS: ExperienceLevel[] = ['Any', 'Entry', 'Mid', 'Senior', 'Lead'];

// Job `level` is a free-form string ("Senior", "Mid–Senior", "Lead Engineer"…),
// so each bucket matches by keyword. A "Mid–Senior" role matches both buckets.
const LEVEL_TOKENS: Record<Exclude<ExperienceLevel, 'Any'>, string[]> = {
  Entry: ['entry', 'junior', 'graduate', 'intern', 'associate'],
  Mid: ['mid', 'intermediate'],
  Senior: ['senior', 'sr.'],
  Lead: ['lead', 'principal', 'staff', 'head', 'director', 'manager'],
};

export function matchesLevel(jobLevel: string, selected: ExperienceLevel): boolean {
  if (selected === 'Any') return true;
  const l = (jobLevel || '').toLowerCase();
  return LEVEL_TOKENS[selected].some((t) => l.includes(t));
}

export interface JobFilters {
  category: string; // 'All' or a category name
  type: string; // 'Any' or a job type
  level: ExperienceLevel; // 'Any' or an experience bucket
  query: string; // free-text role/company search
}

/** True when a job passes every active filter. Category/type are exact; level
 *  is bucketed; query matches the role or company (case-insensitive). */
export function jobMatchesFilters(j: Pick<Job, 'category' | 'type' | 'level' | 'role' | 'company'>, f: JobFilters): boolean {
  const q = f.query.trim().toLowerCase();
  return (
    (f.category === 'All' || j.category === f.category) &&
    (f.type === 'Any' || j.type.toLowerCase() === f.type.toLowerCase()) &&
    matchesLevel(j.level, f.level) &&
    (q === '' || j.role.toLowerCase().includes(q) || j.company.toLowerCase().includes(q))
  );
}

/** How many sheet filters are active (drives the badge on the filter button).
 *  Category lives in the always-visible chips, so it isn't counted here. */
export function activeFilterCount(type: string, level: ExperienceLevel): number {
  return (type !== 'Any' ? 1 : 0) + (level !== 'Any' ? 1 : 0);
}
