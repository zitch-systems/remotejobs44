import { describe, it, expect } from 'vitest';
import { parseFeed, parseJSONFeed, parseXMLFeed, feedJobToDbRow } from './feed-parser';

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

  it('maps WP Job Manager namespaced tags (job_listing:*)', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:job_listing="https://wpjobmanager.com">
<channel>
  <title>Sams Social Media Club &#187; job feed</title>
  <item>
    <title>Social Media Manager</title>
    <link>https://www.example.com/job/social-media-manager/</link>
    <pubDate>Tue, 09 Jun 2026 10:00:00 +0000</pubDate>
    <description><![CDATA[<p>Run our socials end to end.</p>]]></description>
    <job_listing:location>Manchester, UK</job_listing:location>
    <job_listing:job_type>Part Time</job_listing:job_type>
    <job_listing:company>Acme Studio</job_listing:company>
  </item>
</channel></rss>`;
    const r = parseXMLFeed(xml, SOURCE);
    expect(r.total).toBe(1);
    expect(r.jobs[0].company).toBe('Acme Studio');
    expect(r.jobs[0].location).toBe('Manchester, UK');
    expect(r.jobs[0].type).toBe('part-time');
    expect(r.jobs[0].applyUrl).toBe('https://www.example.com/job/social-media-manager/');
    expect(r.jobs[0].description).toContain('Run our socials');
  });
});

describe('feedJobToDbRow', () => {
  const job = {
    id: 'ext_abc123',
    title: 'Backend Engineer',
    company: 'Acme',
    applyUrl: 'https://example.com/jobs/1',
    location: 'Worldwide',
    description: 'Build APIs',
    posted: '2026-01-15T00:00:00.000Z',
    category: 'engineering',
    type: 'full-time',
    level: 'mid',
    skills: ['Python'],
    salaryMin: 90000,
    salaryMax: 120000,
    currency: 'USD',
    source: 'rss',
  };

  it('maps the camelCase preview shape onto jobs-table columns', () => {
    const row = feedJobToDbRow(job, SOURCE)!;
    expect(row.apply_url).toBe('https://example.com/jobs/1');
    expect(row.salary_min).toBe(90000);
    expect(row.salary_max).toBe(120000);
    expect(row.posted_at).toBe('2026-01-15T00:00:00.000Z');
    expect(row.source_url).toBe(SOURCE);
    expect(row.is_active).toBe(true);
    expect(row.logo).toBe('A');
    // the synthetic ext_* id must not reach the uuid primary key
    expect(row.id).toBeUndefined();
    expect(row.applyUrl).toBeUndefined();
  });

  it('returns null without a usable http(s) apply URL', () => {
    expect(feedJobToDbRow({ ...job, applyUrl: '' }, SOURCE)).toBeNull();
    expect(feedJobToDbRow({ ...job, applyUrl: 'javascript:alert(1)' }, SOURCE)).toBeNull();
    expect(feedJobToDbRow({ ...job, applyUrl: undefined }, SOURCE)).toBeNull();
  });

  it('fills safe defaults for sparse feeds', () => {
    const row = feedJobToDbRow({ applyUrl: 'https://example.com/j/1' }, SOURCE)!;
    expect(row.title).toBe('Untitled role');
    expect(row.company).toBe('Unknown');
    expect(row.salary_min).toBeNull();
    expect(row.skills).toBeNull();
    expect(row.source).toBe('rss');
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
