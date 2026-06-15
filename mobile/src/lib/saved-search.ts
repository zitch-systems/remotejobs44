// src/lib/saved-search.ts — pure helpers for saved job searches (the Jobs tab
// lets you save the current query + filters and re-apply them). Kept free of
// React/Supabase so it's unit-tested directly.

export interface SearchCriteria {
  query: string;
  category: string; // 'All' or a category
  type: string; // JobType
  level: string; // ExperienceLevel
  sort: string; // SortBy
}

export interface SavedSearch extends SearchCriteria {
  id: string;
  createdAt: string;
}

/** A search with no query and no active filters isn't worth saving. */
export function isEmptySearch(s: SearchCriteria): boolean {
  return s.query.trim() === '' && (s.category === 'All' || s.category === '') && s.type === 'Any' && s.level === 'Any';
}

/** A short human label, e.g. `"react" · Engineering · Senior` or `All jobs`. */
export function searchLabel(s: SearchCriteria): string {
  const parts: string[] = [];
  const q = s.query.trim();
  if (q) parts.push(`"${q}"`);
  if (s.category && s.category !== 'All') parts.push(s.category);
  if (s.type && s.type !== 'Any') parts.push(s.type);
  if (s.level && s.level !== 'Any') parts.push(s.level);
  return parts.length ? parts.join(' · ') : 'All jobs';
}

/** Two criteria are the same search (used to dedupe + detect "already saved"). */
export function sameCriteria(a: SearchCriteria, b: SearchCriteria): boolean {
  return (
    a.query.trim().toLowerCase() === b.query.trim().toLowerCase() &&
    a.category === b.category &&
    a.type === b.type &&
    a.level === b.level &&
    a.sort === b.sort
  );
}
