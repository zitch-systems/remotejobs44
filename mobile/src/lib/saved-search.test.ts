import { isEmptySearch, sameCriteria, searchLabel, type SearchCriteria } from './saved-search';

const crit = (over: Partial<SearchCriteria>): SearchCriteria => ({ query: '', category: 'All', type: 'Any', level: 'Any', sort: 'recent', ...over });

describe('isEmptySearch', () => {
  it('is true only with no query and no active filters', () => {
    expect(isEmptySearch(crit({}))).toBe(true);
    expect(isEmptySearch(crit({ query: 'react' }))).toBe(false);
    expect(isEmptySearch(crit({ category: 'Design' }))).toBe(false);
    expect(isEmptySearch(crit({ type: 'Contract' }))).toBe(false);
    expect(isEmptySearch(crit({ level: 'Senior' }))).toBe(false);
  });
});

describe('searchLabel', () => {
  it('joins the active parts, else "All jobs"', () => {
    expect(searchLabel(crit({}))).toBe('All jobs');
    expect(searchLabel(crit({ query: ' react ', category: 'Engineering', level: 'Senior' }))).toBe('"react" · Engineering · Senior');
    expect(searchLabel(crit({ type: 'Contract' }))).toBe('Contract');
  });
});

describe('sameCriteria', () => {
  it('ignores query case/whitespace; compares filters + sort', () => {
    expect(sameCriteria(crit({ query: 'React ' }), crit({ query: 'react' }))).toBe(true);
    expect(sameCriteria(crit({ category: 'Design' }), crit({ category: 'Engineering' }))).toBe(false);
    expect(sameCriteria(crit({ sort: 'match' }), crit({ sort: 'recent' }))).toBe(false);
  });
});
