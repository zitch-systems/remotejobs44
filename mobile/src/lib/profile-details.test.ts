import { cleanExperience, cleanLinks, normalizeUrl, type ExperienceItem } from './profile-details';

describe('normalizeUrl', () => {
  it('adds https:// to bare domains, keeps empty + existing scheme', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('   ')).toBe('');
    expect(normalizeUrl('github.com/ada')).toBe('https://github.com/ada');
    expect(normalizeUrl('https://x.com')).toBe('https://x.com');
    expect(normalizeUrl('http://x.com')).toBe('http://x.com');
  });
});

describe('cleanExperience', () => {
  const e = (over: Partial<ExperienceItem>): ExperienceItem => ({ title: '', company: '', period: '', ...over });
  it('trims and drops fully-blank rows', () => {
    const out = cleanExperience([e({ title: ' Engineer ', company: ' Acme ' }), e({}), e({ company: 'X' })]);
    expect(out).toEqual([
      { title: 'Engineer', company: 'Acme', period: '' },
      { title: '', company: 'X', period: '' },
    ]);
  });
});

describe('cleanLinks', () => {
  it('drops empty link values', () => {
    expect(cleanLinks({ github: 'g', linkedin: '', website: 'w' })).toEqual({ github: 'g', website: 'w' });
    expect(cleanLinks({})).toEqual({});
  });
});
