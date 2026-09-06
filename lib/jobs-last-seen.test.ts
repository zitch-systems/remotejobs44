import { describe, it, expect } from 'vitest';
import { batchByLength } from './jobs-last-seen';

describe('batchByLength', () => {
  it('returns no batches for an empty list', () => {
    expect(batchByLength([])).toEqual([]);
  });

  it('keeps a small list in a single batch', () => {
    const urls = ['https://a.example/1', 'https://a.example/2'];
    expect(batchByLength(urls)).toEqual([urls]);
  });

  it('splits on the count cap', () => {
    const urls = Array.from({ length: 250 }, (_, i) => `https://a.example/${i}`);
    const batches = batchByLength(urls, 100, 1_000_000);
    expect(batches.map(b => b.length)).toEqual([100, 100, 50]);
    expect(batches.flat()).toEqual(urls);
  });

  it('splits on the byte cap before the count cap', () => {
    // 40-char URLs, 100-byte budget → 2 per batch even though the count cap is 100.
    const urls = Array.from({ length: 6 }, (_, i) => `https://example.com/jobs/${String(i).repeat(15)}`);
    urls.forEach(u => expect(u.length).toBe(40));
    const batches = batchByLength(urls, 100, 100);
    expect(batches.map(b => b.length)).toEqual([2, 2, 2]);
  });

  it('never drops a value that alone exceeds the byte budget', () => {
    const huge = 'https://example.com/' + 'x'.repeat(5000);
    const urls = ['https://a.example/1', huge, 'https://a.example/2'];
    const batches = batchByLength(urls, 100, 3_500);
    expect(batches.flat()).toEqual(urls);
    // The oversized value gets a batch to itself rather than dragging the
    // others into an over-long request line with it.
    expect(batches.some(b => b.length === 1 && b[0] === huge)).toBe(true);
  });

  it('keeps every batch inside the default request-line budget', () => {
    // 200 realistic ATS apply URLs — the old fixed chunk size. Percent-encoding
    // roughly doubles these on the wire, so the raw budget must stay well under
    // the 8KB nginx request-line limit or PostgREST answers 414.
    const urls = Array.from(
      { length: 200 },
      (_, i) => `https://boards.greenhouse.io/acmecorporation/jobs/${4000000 + i}`,
    );
    const batches = batchByLength(urls);
    expect(batches.length).toBeGreaterThan(1);
    for (const b of batches) {
      expect(b.join('').length).toBeLessThanOrEqual(3_500);
      expect(b.length).toBeLessThanOrEqual(100);
    }
    expect(batches.flat()).toEqual(urls);
  });

  it('preserves order and loses nothing', () => {
    const urls = Array.from({ length: 137 }, (_, i) => `https://a.example/${i}`);
    expect(batchByLength(urls, 10, 200).flat()).toEqual(urls);
  });
});
