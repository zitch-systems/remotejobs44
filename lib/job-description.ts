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
