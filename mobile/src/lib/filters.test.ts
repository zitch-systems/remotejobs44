import { activeFilterCount, jobMatchesFilters, matchesLevel, type JobFilters } from './filters';
import type { Job } from './types';

const job = (over: Partial<Job>): Job =>
  ({ category: 'Engineering', type: 'Full-time', level: 'Senior', role: 'Backend Engineer', company: 'Flutterwave', ...over } as Job);

const filters = (over: Partial<JobFilters>): JobFilters => ({ category: 'All', type: 'Any', level: 'Any', query: '', ...over });

describe('matchesLevel', () => {
  it('buckets free-form level strings by keyword', () => {
    expect(matchesLevel('Senior', 'Senior')).toBe(true);
    expect(matchesLevel('Mid', 'Senior')).toBe(false);
    expect(matchesLevel('Lead Engineer', 'Lead')).toBe(true);
    expect(matchesLevel('Junior Developer', 'Entry')).toBe(true);
  });
  it('matches a hybrid level under both buckets', () => {
    expect(matchesLevel('Mid–Senior', 'Mid')).toBe(true);
    expect(matchesLevel('Mid–Senior', 'Senior')).toBe(true);
  });
  it('Any always matches', () => {
    expect(matchesLevel('whatever', 'Any')).toBe(true);
    expect(matchesLevel('', 'Any')).toBe(true);
  });
});

describe('jobMatchesFilters', () => {
  it('passes when every active filter matches', () => {
    expect(jobMatchesFilters(job({}), filters({ category: 'Engineering', type: 'Full-time', level: 'Senior', query: 'back' }))).toBe(true);
  });
  it('fails on a category / type / level / query mismatch', () => {
    expect(jobMatchesFilters(job({}), filters({ category: 'Design' }))).toBe(false);
    expect(jobMatchesFilters(job({}), filters({ type: 'Contract' }))).toBe(false);
    expect(jobMatchesFilters(job({}), filters({ level: 'Entry' }))).toBe(false);
    expect(jobMatchesFilters(job({}), filters({ query: 'frontend' }))).toBe(false);
  });
  it('query matches role or company, case-insensitively', () => {
    expect(jobMatchesFilters(job({}), filters({ query: 'FLUTTER' }))).toBe(true);
    expect(jobMatchesFilters(job({}), filters({ query: 'engineer' }))).toBe(true);
  });
});

describe('activeFilterCount', () => {
  it('counts non-default type and level', () => {
    expect(activeFilterCount('Any', 'Any')).toBe(0);
    expect(activeFilterCount('Contract', 'Any')).toBe(1);
    expect(activeFilterCount('Contract', 'Senior')).toBe(2);
  });
});
