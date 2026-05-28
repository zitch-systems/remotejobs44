import { describe, it, expect } from 'vitest';
import { parseFeed, parseJSONFeed, parseXMLFeed } from './feed-parser';

const SOURCE = 'https://example.com/feed';

describe('parseJSONFeed', () => {
  it('parses Remotive-shape jobs array', () => {
    const body = JSON.stringify({
      'job-count': 2,
      jobs: [
        {
          title: 'Backend Engineer',
          company_name: 'Acme',
          url: 'https://example.com/jobs/1',
          publication_date: '2025-01-15T00:00:00Z',
          candidate_required_location: 'Worldwide',
          description: 'Build APIs',
        },
        {
          title: 'Frontend Engineer',
          company_name: 'Acme',
          url: 'https://example.com/jobs/2',
        },
      ],
    });
    const r = parseJSONFeed(body, SOURCE);
    expect(r.method).toBe('json-api');
    expect(r.total).toBe(2);
    expect(r.jobs[0].title).toBe('Backend Engineer');
    expect(r.jobs[0].applyUrl).toBe('https://example.com/jobs/1');
  });

  it('parses Greenhouse-shape positions array', () => {
    const body = JSON.stringify({
      positions: [
        { title: 'PM', employer: 'Acme', apply_url: 'https://example.com/p/1' },
      ],
    });
    const r = parseJSONFeed(body, SOURCE);
    expect(r.total).toBe(1);
    expect(r.jobs[0].title).toBe('PM');
  });

  it('parses raw array', () => {
    const body = JSON.stringify([
      { position: 'Designer', company: 'Acme', url: 'https://example.com/p/1' },
    ]);
    const r = parseJSONFeed(body, SOURCE);
    expect(r.total).toBe(1);
    expect(r.jobs[0].title).toBe('Designer');
  });

  it('returns error metadata for invalid JSON', () => {
    const r = parseJSONFeed('{not valid json', SOURCE);
    expect(r.method).toBe('json-api');
    expect(r.total).toBe(0);
    expect(r.error).toBeTruthy();
  });

  it('returns zero jobs for empty arrays', () => {
    expect(parseJSONFeed(JSON.stringify({ jobs: [] }), SOURCE).total).toBe(0);
    expect(parseJSONFeed(JSON.stringify([]), SOURCE).total).toBe(0);
  });
});

describe('parseXMLFeed', () => {
  it('parses RSS 2.0', () => {
    const xml = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>Senior Engineer</title>
    <link>https://example.com/jobs/1</link>
    <description>Great role.</description>
    <pubDate>Wed, 15 Jan 2025 12:00:00 GMT</pubDate>
  </item>
</channel></rss>`;
    const r = parseXMLFeed(xml, SOURCE);
    expect(r.method).toBe('rss');
    expect(r.total).toBe(1);
    expect(r.jobs[0].title).toBe('Senior Engineer');
    expect(r.jobs[0].applyUrl).toBe('https://example.com/jobs/1');
  });

  it('parses Atom feeds', () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Designer</title>
    <link href="https://example.com/jobs/2" />
    <summary>Design things.</summary>
    <published>2025-01-10T00:00:00Z</published>
  </entry>
</feed>`;
    const r = parseXMLFeed(xml, SOURCE);
    expect(r.method).toBe('rss');
    expect(r.total).toBe(1);
    expect(r.jobs[0].title).toBe('Designer');
  });

  it('handles CDATA blocks', () => {
    const xml = `<rss><channel>
  <item>
    <title><![CDATA[Senior Engineer & Lead]]></title>
    <link>https://example.com/jobs/3</link>
  </item>
</channel></rss>`;
    const r = parseXMLFeed(xml, SOURCE);
    expect(r.total).toBe(1);
    expect(r.jobs[0].title).toBe('Senior Engineer & Lead');
  });

  it('skips items missing title or link', () => {
    const xml = `<rss><channel>
  <item><title>Has title</title><link>https://example.com/1</link></item>
  <item><title>No link</title></item>
  <item><link>https://example.com/3</link></item>
</channel></rss>`;
    const r = parseXMLFeed(xml, SOURCE);
    expect(r.total).toBe(1);
  });
});

describe('parseFeed (auto-detect)', () => {
  it('routes JSON content-type to JSON parser', () => {
    const r = parseFeed('[{"position":"X","company":"Y","url":"https://e.com/1"}]', 'application/json', SOURCE);
    expect(r.method).toBe('json-api');
  });

  it('routes RSS content-type to XML parser', () => {
    const r = parseFeed('<rss><channel><item><title>T</title><link>https://e.com/1</link></item></channel></rss>', 'application/rss+xml', SOURCE);
    expect(r.method).toBe('rss');
  });

  it('detects JSON by leading bracket even with wrong content-type', () => {
    const r = parseFeed('{"jobs":[]}', 'text/plain', SOURCE);
    expect(r.method).toBe('json-api');
  });

  it('returns unknown for HTML / other formats', () => {
    const r = parseFeed('<html><body>Not a feed</body></html>', 'text/html', SOURCE);
    expect(r.method).toBe('unknown');
    expect(r.error).toBeTruthy();
  });
});
