import { describe, it, expect } from 'vitest';
import { normalizeJobDescription } from './job-description';

describe('normalizeJobDescription', () => {
  it('passes plaintext through unchanged', () => {
    const input = 'Senior Engineer\n\nResponsibilities:\n- Build things\n- Ship features';
    expect(normalizeJobDescription(input)).toBe(input);
  });

  it('decodes named HTML entities', () => {
    expect(normalizeJobDescription('Build &amp; ship')).toBe('Build & ship');
    expect(normalizeJobDescription('AT&amp;T &quot;Network&quot;')).toBe('AT&T "Network"');
    expect(normalizeJobDescription('&lt;3 &mdash; we&apos;re hiring')).toBe('<3 — we\'re hiring');
  });

  it('decodes numeric entities (decimal and hex)', () => {
    expect(normalizeJobDescription('&#65;&#66;&#67;')).toBe('ABC');
    expect(normalizeJobDescription('&#x41;&#x42;&#x43;')).toBe('ABC');
  });

  it('two-pass decode — handles double-encoded entities', () => {
    // First decode: &amp;lt;p&amp;gt; → &lt;p&gt;
    // Second decode: &lt;p&gt; → <p>
    // Then HTML strip applies to <p>.
    expect(normalizeJobDescription('&amp;lt;p&amp;gt;hi&amp;lt;/p&amp;gt;'))
      .toBe('hi');
  });

  it('strips HTML tags after entity decode', () => {
    expect(normalizeJobDescription('&lt;p&gt;Hello &lt;strong&gt;world&lt;/strong&gt;&lt;/p&gt;'))
      .toBe('Hello world');
  });

  it('converts <p>/<div> close tags to paragraph breaks', () => {
    const html = '&lt;p&gt;First para.&lt;/p&gt;&lt;p&gt;Second para.&lt;/p&gt;';
    const out  = normalizeJobDescription(html);
    expect(out).toContain('First para.');
    expect(out).toContain('Second para.');
    expect(out).toContain('\n\n');
  });

  it('converts <li> to bullet markers', () => {
    const html = '&lt;ul&gt;&lt;li&gt;Alpha&lt;/li&gt;&lt;li&gt;Beta&lt;/li&gt;&lt;/ul&gt;';
    const out  = normalizeJobDescription(html);
    expect(out).toContain('- Alpha');
    expect(out).toContain('- Beta');
  });

  it('converts headings to terminated section markers', () => {
    const html = '&lt;h2&gt;Responsibilities&lt;/h2&gt;Do things';
    const out  = normalizeJobDescription(html);
    expect(out).toMatch(/Responsibilities:/);
  });

  it('collapses runs of newlines to at most two when HTML triggers the pass', () => {
    // Plaintext-only input short-circuits and is returned as-is (the
    // post-decode regex only fires when HTML markup is detected). Force
    // the HTML path with empty tags so the collapse rule runs.
    expect(normalizeJobDescription('a&lt;p&gt;&lt;/p&gt;&lt;p&gt;&lt;/p&gt;&lt;p&gt;&lt;/p&gt;b'))
      .toMatch(/^a\n{1,2}b$/);
  });

  it('does NOT touch plaintext input — short-circuits when no HTML markup found', () => {
    // Documented contract: bare \n stays as-is so admin job text that
    // happens to use lots of newlines isn't squashed.
    expect(normalizeJobDescription('a\n\n\n\n\nb')).toBe('a\n\n\n\n\nb');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeJobDescription('')).toBe('');
  });

  it('the actual production failure mode — the screenshot example', () => {
    const input = '&lt;div class=&quot;content-intro&quot;&gt;&lt;p&gt;&lt;strong&gt;We&#39;re transforming the grocery industry&lt;/strong&gt;&lt;/p&gt;';
    const out   = normalizeJobDescription(input);
    expect(out).not.toContain('&lt;');
    expect(out).not.toContain('&quot;');
    expect(out).not.toContain('<');
    expect(out).toContain("We're transforming the grocery industry");
  });
});
