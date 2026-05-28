import { describe, it, expect } from 'vitest';
import { skillSlug, SKILLS } from './seo-slices';

describe('skillSlug', () => {
  it('returns null for null / empty inputs', () => {
    expect(skillSlug('')).toBeNull();
  });

  it('returns null for skills not in the catalogue', () => {
    expect(skillSlug('Fortran')).toBeNull();
    expect(skillSlug('Cobol')).toBeNull();
    expect(skillSlug('random unknown skill')).toBeNull();
  });

  it('maps canonical label → slug', () => {
    expect(skillSlug('TypeScript')).toBe('typescript');
    expect(skillSlug('Python')).toBe('python');
    expect(skillSlug('React')).toBe('react');
  });

  it('is case-insensitive', () => {
    expect(skillSlug('REACT')).toBe(skillSlug('React'));
    expect(skillSlug('python')).toBe(skillSlug('Python'));
  });

  it('handles common aliases (next.js, c#, vue.js, etc.)', () => {
    expect(skillSlug('Next.js')).toBe('nextjs');
    expect(skillSlug('Nest.js')).toBe('nestjs');
    expect(skillSlug('Vue.js')).toBe('vue');
    expect(skillSlug('C#')).toBe('csharp');
    expect(skillSlug('.NET')).toBe('csharp');
    expect(skillSlug('Node.js')).toBe('node');
  });

  it('ML / AI alias both resolve to machine-learning', () => {
    expect(skillSlug('ML')).toBe('machine-learning');
    expect(skillSlug('AI')).toBe('machine-learning');
  });

  it('every SKILLS entry resolves to itself', () => {
    for (const s of SKILLS) {
      // The label form
      const fromLabel = skillSlug(s.label);
      expect(fromLabel).toBe(s.slug);
      // The slug form should round-trip too
      const fromSlug = skillSlug(s.slug);
      expect(fromSlug).toBe(s.slug);
    }
  });
});
