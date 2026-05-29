import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isSafeOpenUrl, safeWindowOpen } from './safe-url';

// Pinning the XSS-defense decisions for ApplyRedirectModal +
// applicationsApi.apply. Every external apply URL comes from a third-
// party ATS feed; a hostile/compromised feed could ship `javascript:`,
// `data:`, or `vbscript:` URLs that execute in OUR origin if we ever
// blindly window.open() them. These tests pin the allow-list and the
// scheme-comparison correctness (case + whitespace).

describe('isSafeOpenUrl', () => {
  describe('accepts safe schemes', () => {
    it.each([
      ['https://example.com/apply'],
      ['http://example.com/apply'],
      ['mailto:jobs@example.com'],
      ['mailto:jobs@example.com?subject=Application'],
      ['HTTPS://example.com'],
      ['Https://example.com'],
      ['  https://example.com  '],
    ])('accepts %s', (u) => {
      expect(isSafeOpenUrl(u)).toBe(true);
    });
  });

  describe('rejects dangerous schemes', () => {
    it.each([
      ['javascript:alert(1)'],
      ['JavaScript:alert(1)'],
      ['JAVASCRIPT:alert(1)'],
      ['data:text/html,<script>alert(1)</script>'],
      ['data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
      ['vbscript:msgbox("xss")'],
      ['file:///etc/passwd'],
      ['ftp://example.com'],
      ['blob:https://example.com/uuid'],
      ['about:blank'],
      // Whitespace-padded `javascript:` is the classic browser-tolerant
      // bypass — `\t` and `\n` inside the scheme used to be accepted by
      // Chrome's URL parser. URL() now normalises but a paranoid pin is
      // cheap insurance.
      [' javascript:alert(1)'],
      ['\tjavascript:alert(1)'],
    ])('rejects %s', (u) => {
      expect(isSafeOpenUrl(u)).toBe(false);
    });
  });

  describe('rejects malformed inputs', () => {
    it.each([
      [null],
      [undefined],
      [''],
      ['   '],
      ['not-a-url'],
      ['://no-scheme'],
      ['example.com'],          // missing scheme — relative URL
      ['/relative/path'],
      ['#hash-only'],
    ])('rejects %s', (u) => {
      expect(isSafeOpenUrl(u)).toBe(false);
    });

    it('rejects non-string types', () => {
      // @ts-expect-error — testing runtime behaviour for unusual callers
      expect(isSafeOpenUrl(123)).toBe(false);
      // @ts-expect-error
      expect(isSafeOpenUrl({})).toBe(false);
      // @ts-expect-error
      expect(isSafeOpenUrl([])).toBe(false);
    });
  });
});

describe('safeWindowOpen', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Stub window so the call doesn't actually try to open a popup
    // during tests. happy-dom/jsdom environments differ; this assignment
    // works under both.
    if (typeof window === 'undefined') {
      // @ts-expect-error — assign for the test if no DOM env loaded
      globalThis.window = { open: () => null } as Window;
    }
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    openSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('opens a safe URL with noopener,noreferrer', () => {
    const ok = safeWindowOpen('https://example.com/apply');
    expect(ok).toBe(true);
    expect(openSpy).toHaveBeenCalledWith('https://example.com/apply', '_blank', 'noopener,noreferrer');
  });

  it('refuses javascript: URL and never calls window.open', () => {
    const ok = safeWindowOpen('javascript:alert(1)');
    expect(ok).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('refuses data: URL and never calls window.open', () => {
    const ok = safeWindowOpen('data:text/html,<script>alert(1)</script>');
    expect(ok).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('refuses null / undefined / empty string silently from window.open', () => {
    expect(safeWindowOpen(null)).toBe(false);
    expect(safeWindowOpen(undefined)).toBe(false);
    expect(safeWindowOpen('')).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('opens mailto: URLs (used by the Report Job link)', () => {
    const ok = safeWindowOpen('mailto:hello@example.com');
    expect(ok).toBe(true);
    expect(openSpy).toHaveBeenCalled();
  });
});
