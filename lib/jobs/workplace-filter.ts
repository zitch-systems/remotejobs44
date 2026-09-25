export const WORKPLACE_OPTIONS = [
  { value: 'remote', label: 'Remote' },
  { value: 'onsite', label: 'On-site' },
  { value: 'relocation', label: 'Relocation' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'all', label: 'All jobs' },
] as const;

export type WorkplaceFilter = typeof WORKPLACE_OPTIONS[number]['value'];

export function parseWorkplace(value: string | null | undefined, fallback: WorkplaceFilter = 'remote'): WorkplaceFilter {
  return WORKPLACE_OPTIONS.some(o => o.value === value) ? value as WorkplaceFilter : fallback;
}

// Apply before pagination and count, including when a text query is present.
// Relocation is independent of workplace arrangement: a hybrid role can also
// offer relocation. Unknown and explicitly negative support never match.
export function applyWorkplaceFilter<T extends { eq: (key: string, value: string) => T; or: (filter: string) => T }>(query: T, mode: WorkplaceFilter): T {
  if (mode === 'all') return query;
  if (mode === 'relocation') return query.or('relocation_supported.eq.true,visa_sponsorship.eq.true');
  return query.eq('workplace_type', mode);
}
