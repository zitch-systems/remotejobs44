import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logInfo, logWarn, logError, logEvent } from './log';

describe('lib/log', () => {
  let logSpy:  ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errSpy:  ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy  = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errSpy  = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function parseLastCall(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
    expect(spy).toHaveBeenCalled();
    const args = spy.mock.calls[spy.mock.calls.length - 1];
    expect(args).toHaveLength(1);
    return JSON.parse(args[0] as string);
  }

  describe('level routing', () => {
    it('logInfo writes a single JSON line to console.log', () => {
      logInfo({ event: 'test.info' });
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errSpy).not.toHaveBeenCalled();
    });

    it('logWarn writes to console.warn', () => {
      logWarn({ event: 'test.warn' });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).not.toHaveBeenCalled();
      expect(errSpy).not.toHaveBeenCalled();
    });

    it('logError writes to console.error', () => {
      logError({ event: 'test.err' });
      expect(errSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('logEvent routes by level argument', () => {
      logEvent('info',  { event: 'a' });
      logEvent('warn',  { event: 'b' });
      logEvent('error', { event: 'c' });
      expect(logSpy.mock.calls.length).toBe(1);
      expect(warnSpy.mock.calls.length).toBe(1);
      expect(errSpy.mock.calls.length).toBe(1);
    });
  });

  describe('payload shape', () => {
    it('emits ts, level, event in the canonical order', () => {
      logInfo({ event: 'ingest.run', source: 'remotive', added: 42 });
      const out = parseLastCall(logSpy);
      expect(out.ts).toBeTypeOf('string');
      expect(out.level).toBe('info');
      expect(out.event).toBe('ingest.run');
      expect(out.source).toBe('remotive');
      expect(out.added).toBe(42);
    });

    it('ts is a valid ISO 8601 string', () => {
      logInfo({ event: 'x' });
      const out = parseLastCall(logSpy);
      const parsed = new Date(out.ts as string);
      expect(Number.isFinite(parsed.getTime())).toBe(true);
    });

    it('arbitrary nested objects pass through', () => {
      logError({
        event: 'webhook.failed',
        data:  { reference: 'TXN_x', user_id: 'abc' },
      });
      const out = parseLastCall(errSpy);
      expect(out.data).toEqual({ reference: 'TXN_x', user_id: 'abc' });
    });
  });

  describe('safety', () => {
    it('handles circular references without crashing', () => {
      // payload.self === payload — a cycle the replacer must detect.
      const circular: Record<string, unknown> = { event: 'test.circular' };
      circular.self = circular;
      expect(() => logError(circular as Parameters<typeof logError>[0])).not.toThrow();
      const out = parseLastCall(errSpy);
      // The first descent into `self` is fine (just the same object
      // again, freshly walked); the *second* descent into `self.self`
      // is where the cycle is caught and replaced with the marker.
      const nested = out.self as { self: unknown };
      expect(nested.self).toBe('[Circular]');
    });

    it('serializes Error instances to {name, message}', () => {
      const err = new TypeError('something bad');
      logError({ event: 'test.error_instance', error: err });
      const out = parseLastCall(errSpy);
      expect(out.error).toEqual({ name: 'TypeError', message: 'something bad' });
    });

    it('emits exactly one JSON line per call (no multi-line spew)', () => {
      logInfo({ event: 'test.single', message: 'first line\nsecond line\nthird' });
      expect(logSpy).toHaveBeenCalledTimes(1);
      const line = logSpy.mock.calls[0][0] as string;
      // Single JSON object — embedded \n in `message` stays escaped.
      expect(line.startsWith('{')).toBe(true);
      expect(line.endsWith('}')).toBe(true);
      // Verify parseable as one JSON, not three lines.
      expect(() => JSON.parse(line)).not.toThrow();
    });
  });
});
