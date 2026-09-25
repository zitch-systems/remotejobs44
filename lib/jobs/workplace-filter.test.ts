import { describe, expect, it, vi } from 'vitest';
import { applyWorkplaceFilter, parseWorkplace } from './workplace-filter';

describe('workplace filters', () => {
  it('defaults invalid and legacy values safely', () => {
    expect(parseWorkplace(undefined)).toBe('remote');
    expect(parseWorkplace('onsite')).toBe('onsite');
    expect(parseWorkplace('unexpected', 'all')).toBe('all');
  });

  it('uses explicit support evidence for relocation results', () => {
    const query = { eq: vi.fn(), or: vi.fn() } as any;
    query.eq.mockReturnValue(query);
    query.or.mockReturnValue(query);

    expect(applyWorkplaceFilter(query, 'relocation')).toBe(query);
    expect(query.or).toHaveBeenCalledWith('relocation_supported.eq.true,visa_sponsorship.eq.true');
    expect(query.eq).not.toHaveBeenCalled();
  });

  it('does not add a database predicate for all jobs', () => {
    const query = { eq: vi.fn(), or: vi.fn() } as any;
    expect(applyWorkplaceFilter(query, 'all')).toBe(query);
    expect(query.eq).not.toHaveBeenCalled();
    expect(query.or).not.toHaveBeenCalled();
  });
});
