import { describe, it, expect } from 'vitest';
import { dedupeByApplyUrl } from './dedupe-jobs';

describe('dedupeByApplyUrl', () => {
  it('collapses repeated apply_urls to a single row', () => {
    const out = dedupeByApplyUrl([
      { apply_url: 'https://x.com/a', title: 'A' },
      { apply_url: 'https://x.com/a', title: 'A again' },
    ]);
    expect(out).toHaveLength(1);
  });

  it('keeps the last occurrence so the freshest copy in the batch wins', () => {
    const out = dedupeByApplyUrl([
      { apply_url: 'https://x.com/a', title: 'stale' },
      { apply_url: 'https://x.com/a', title: 'fresh' },
    ]);
    expect(out[0].title).toBe('fresh');
  });

  it('preserves distinct apply_urls', () => {
    const out = dedupeByApplyUrl([
      { apply_url: 'https://x.com/a' },
      { apply_url: 'https://x.com/b' },
      { apply_url: 'https://x.com/c' },
    ]);
    expect(out.map(r => r.apply_url).sort()).toEqual([
      'https://x.com/a',
      'https://x.com/b',
      'https://x.com/c',
    ]);
  });

  it('passes through rows with no apply_url without collapsing them', () => {
    // NULLs compare distinct in a unique index, so two url-less rows must
    // both survive — they can never conflict on insert.
    const out = dedupeByApplyUrl([
      { apply_url: null, title: 'one' },
      { apply_url: undefined, title: 'two' },
      { apply_url: '', title: 'three' },
    ]);
    expect(out).toHaveLength(3);
  });

  it('keeps url-less rows alongside deduped url rows', () => {
    const out = dedupeByApplyUrl([
      { apply_url: 'https://x.com/a', title: 'a1' },
      { apply_url: null, title: 'no-url' },
      { apply_url: 'https://x.com/a', title: 'a2' },
    ]);
    expect(out).toHaveLength(2);
    expect(out.find(r => r.apply_url === 'https://x.com/a')?.title).toBe('a2');
    expect(out.find(r => r.apply_url === null)?.title).toBe('no-url');
  });

  it('returns an empty array unchanged', () => {
    expect(dedupeByApplyUrl([])).toEqual([]);
  });

  it('keeps a scam-flagged duplicate over a clean one regardless of order', () => {
    const cleanFirst = dedupeByApplyUrl([
      { apply_url: 'https://x.com/a', title: 'clean', flagged: false },
      { apply_url: 'https://x.com/a', title: 'scam',  flagged: true },
    ]);
    expect(cleanFirst[0].flagged).toBe(true);
    // ...and when the flagged one comes first, it still wins (not last-write).
    const flaggedFirst = dedupeByApplyUrl([
      { apply_url: 'https://x.com/a', title: 'scam',  flagged: true },
      { apply_url: 'https://x.com/a', title: 'clean', flagged: false },
    ]);
    expect(flaggedFirst[0].flagged).toBe(true);
  });

  it('prefers the richer copy (longer description) when neither is flagged', () => {
    const out = dedupeByApplyUrl([
      { apply_url: 'https://x.com/a', title: 'rich', description: 'A long, detailed description.' },
      { apply_url: 'https://x.com/a', title: 'sparse', description: 'short' },
    ]);
    expect(out[0].title).toBe('rich');
  });
});
