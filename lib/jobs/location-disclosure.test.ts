import { describe, expect, it } from 'vitest';
import { hiringLocationDisclosure } from './location-disclosure';
import { REGION_TERMS } from './region-terms';

describe('hiring location disclosure', () => {
  it('does not equate remote work with worldwide eligibility', () => {
    expect(hiringLocationDisclosure('Remote', true).uncertain).toBe(true);
    expect(hiringLocationDisclosure('Remote', true).label).toBe('Hiring countries not stated');
    expect(hiringLocationDisclosure('Location not specified', true).uncertain).toBe(true);
    expect(hiringLocationDisclosure('Remote - US only', true).label).toBe('Employer-listed location');
    expect(hiringLocationDisclosure('Nigeria, South Africa', true).detail).toContain('Nigeria, South Africa');
  });

  it('labels only an explicit unrestricted location as worldwide', () => {
    expect(hiringLocationDisclosure('Worldwide', true).label).toBe('Worldwide stated');
    expect(hiringLocationDisclosure('Worldwide except US', true).label).toBe('Employer-listed location');
    expect(REGION_TERMS.worldwide).not.toContain('remote');
  });
});
