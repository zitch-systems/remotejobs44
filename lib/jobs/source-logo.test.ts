import { describe, expect, it } from 'vitest';
import { safeLogoUrl } from './source-logo';

describe('safeLogoUrl', () => {
  it('keeps explicit public HTTPS images', () => {
    expect(safeLogoUrl('https://cdn.example.com/acme/logo.png')).toBe('https://cdn.example.com/acme/logo.png');
  });

  it.each([
    'http://cdn.example.com/logo.png',
    'https://localhost/logo.png',
    'https://127.0.0.1/logo.png',
    'data:image/svg+xml;base64,abc',
    'javascript:alert(1)',
    'A',
  ])('rejects unsafe or non-URL logo %s', value => {
    expect(safeLogoUrl(value)).toBeNull();
  });
});
