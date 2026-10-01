import { describe, expect, it } from 'vitest';
import { normalizeAlertCategory } from './job-alerts';

describe('normalizeAlertCategory', () => {
  it('accepts supported category keys and normalizes case', () => {
    expect(normalizeAlertCategory(' Engineering ')).toBe('engineering');
    expect(normalizeAlertCategory('all')).toBe('all');
  });

  it('maps an omitted category to the all-category behavior', () => {
    expect(normalizeAlertCategory(null)).toBeNull();
    expect(normalizeAlertCategory('')).toBeNull();
  });

  it('rejects categories that can never match the alert sender', () => {
    expect(normalizeAlertCategory('not-a-category')).toBeUndefined();
  });
});
