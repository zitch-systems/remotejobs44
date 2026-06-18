// src/lib/filters.ts — pure, dependency-free job-filter logic shared by the
// Home feed and the Jobs tab. Kept out of components so it can be unit-tested
// directly (see filters.test.ts).
import type { Job } from './types';

export type ExperienceLevel = 'Any' | 'Entry' | 'Mid' | 'Senior' | 'Lead';

export const EXPERIENCE_LEVELS: ExperienceLevel[] = ['Any', 'Entry', 'Mid', 'Senior', 'Lead'];

// Job `level` is a free-form string ("Senior", "Mid–Senior", "Lead Engineer"…),
// so each bucket matches by keyword. A "Mid–Senior" role matches both buckets.
// Exported so the server-side query (lib/jobs.ts) can build the same buckets.
export const LEVEL_TOKENS: Record<Exclude<ExperienceLevel, 'Any'>, string[]> = {
  Entry: ['entry', 'junior', 'graduate', 'intern', 'associate'],
  Mid: ['mid', 'intermediate'],
  Senior: ['senior', 'sr.'],
  Lead: ['lead', 'principal', 'staff', 'head', 'director', 'manager'],
};

// Shared filter option lists. `value` is the lowercase DB value (the category /
// type columns are stored lowercase); an absent value means "no filter".
export interface FilterOption {
  label: string;
  value?: string;
}
export const CATEGORY_OPTIONS: FilterOption[] = [
  { label: 'All' },
  { label: 'Engineering', value: 'engineering' },
  { label: 'Sales', value: 'sales' },
  { label: 'Marketing', value: 'marketing' },
  { label: 'Operations', value: 'operations' },
  { label: 'Data', value: 'data' },
  { label: 'Finance', value: 'finance' },
  { label: 'Product', value: 'product' },
  { label: 'HR', value: 'hr' },
  { label: 'Design', value: 'design' },
  { label: 'Legal', value: 'legal' },
  { label: 'Other', value: 'other' },
];
export const TYPE_OPTIONS: FilterOption[] = [
  { label: 'Any' },
  { label: 'Full-time', value: 'full-time' },
  { label: 'Contract', value: 'contract' },
  { label: 'Part-time', value: 'part-time' },
  { label: 'Internship', value: 'internship' },
  { label: 'Entry-level', value: 'entry' },
];
// Date-posted buckets — `days` is the max age; absent means any time.
export interface DateOption {
  label: string;
  days?: number;
}
export const DATE_OPTIONS: DateOption[] = [
  { label: 'Any time' },
  { label: 'Past 24 hours', days: 1 },
  { label: 'Past week', days: 7 },
  { label: 'Past month', days: 30 },
];

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
    // Category/type are stored lowercase in the DB but the UI labels are
    // capitalised — compare case-insensitively so the filter actually matches.
    (f.category === 'All' || j.category.toLowerCase() === f.category.toLowerCase()) &&
    (f.type === 'Any' || j.type.toLowerCase() === f.type.toLowerCase()) &&
    matchesLevel(j.level, f.level) &&
    (q === '' || j.role.toLowerCase().includes(q) || j.company.toLowerCase().includes(q))
  );
}

/** How many sheet filters are active (drives the badge on the filter button).
 *  Category lives in the always-visible chips, so it isn't counted here. */
export function activeFilterCount(
  type: string,
  level: ExperienceLevel,
  remoteOnly = false,
  postedWithinDays?: number,
): number {
  return (type !== 'Any' ? 1 : 0) + (level !== 'Any' ? 1 : 0) + (remoteOnly ? 1 : 0) + (postedWithinDays ? 1 : 0);
}
