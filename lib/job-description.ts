// lib/job-description.ts
// Normalize scraped job descriptions into plaintext.
//
// Most ATS feeds give us plaintext with line breaks. A meaningful subset
// (Greenhouse, Lever exports, some Workday boards) ships the description
// already serialized as HTML — sometimes raw, sometimes with the angle
// brackets HTML-entity-encoded by an upstream JSON encoder. Without
// normalization the user sees literal `&lt;p&gt;` strings on the page,
// and SEO meta descriptions ship the same noise.

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  hellip: '…', mdash: '—', ndash: '–', copy: '©',
  reg: '®', trade: '™',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (m, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0) return m;
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

/**
 * Strip/transform HTML in a scraped job description into plaintext with
 * paragraph breaks (\n\n), list bullets (`- `), and section markers — the
 * shape the /jobs/[id] structure inferencer already understands.
 */
export function normalizeJobDescription(raw: string): string {
  // Two-pass decode: some scrapers double-encode (`&amp;lt;` → `&lt;`
  // after the first pass → `<` after the second).
  let s = decodeEntities(decodeEntities(raw));
  if (!/<\w/.test(s)) return s; // already plaintext, nothing to strip

  s = s
    .replace(/<br\s*\/?>/gi,                  '\n')
    .replace(/<\/(p|div|section|article)>/gi, '\n\n')
    .replace(/<(p|div|section|article)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi,                   '\n- ')
    .replace(/<\/li>/gi,                      '')
    .replace(/<\/?(ul|ol)[^>]*>/gi,           '\n')
    .replace(/<h[1-6][^>]*>/gi,               '\n\n')
    .replace(/<\/h[1-6]>/gi,                  ':\n')
    .replace(/<[^>]+>/g,                      '');
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build a clean, formatted HTML string for the JobPosting `description`
 * structured-data field. Google explicitly recommends the description be
 * HTML with paragraph/list formatting (it renders the markup in the Google
 * Jobs detail panel) — a flat plaintext blob is accepted but reads worse and
 * loses the bullet structure that recruiters scan for. We reuse the
 * normalized plaintext (which already collapses scraped HTML to `\n\n`
 * paragraphs and `- ` bullets) and re-emit it as a safe, whitelisted subset
 * of HTML: only <p>, <ul>, <li> with every text node escaped, so nothing
 * the scraper injected can break out of the JSON-LD <script>.
 */
export function jobDescriptionToHtml(raw: string): string {
  const text = normalizeJobDescription(raw);
  if (!text) return '';
  const blocks: string[] = [];
  let bullets: string[] = [];
  let para: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push('<ul>' + bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('') + '</ul>');
    bullets = [];
  };
  const flushPara = () => {
    if (!para.length) return;
    const t = para.join(' ').trim();
    if (t) blocks.push(`<p>${escapeHtml(t)}</p>`);
    para = [];
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) { flushBullets(); flushPara(); continue; }
    const m = line.match(/^[-*•·●]\s+(.+)$/) || line.match(/^\d+[.)]\s+(.+)$/);
    if (m) { flushPara(); bullets.push(m[1]); continue; }
    flushBullets();
    para.push(line);
  }
  flushBullets();
  flushPara();
  return blocks.join('');
}
