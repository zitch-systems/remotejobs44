import { describe, it, expect, vi } from 'vitest';
import { extractDirectApplyLink, enrichDirectApplyLinks } from './apply-link';

const BOARD_PAGE = 'https://www.club.example/job/social-media-manager/';

// WP Job Manager single-job page, default templates: the apply section
// renders the `_application` meta as an external link or a mailto.
const WPJM_URL_PAGE = `<!doctype html><html><body>
<nav><a href="https://www.club.example/jobs/">All jobs</a></nav>
<div class="job_share">
  <a href="https://twitter.com/intent/tweet?url=x">Tweet</a>
  <a href="https://www.linkedin.com/shareArticle?url=x">Share</a>
</div>
<h1>Social Media Manager</h1>
<div class="job_application application">
  <input type="button" class="application_button button" value="Apply for job" />
  <div class="application_details">
    <p>To apply for this job please visit
      <a href="https://boards.greenhouse.io/acme/jobs/4012" rel="nofollow noopener" target="_blank">boards.greenhouse.io</a>.
    </p>
  </div>
</div>
<footer><a href="https://www.club.example/about/">About</a></footer>
</body></html>`;

const WPJM_EMAIL_PAGE = `<!doctype html><html><body>
<div class="application_details">
  <p>To apply for this job <strong>email your details to
    <a class="job_application_email" href="mailto:hr@acme.example?subject=Application%20via%20Club">hr@acme.example</a></strong>
  </p>
</div>
</body></html>`;

describe('extractDirectApplyLink', () => {
  it('finds the external apply link in the WP Job Manager apply section', () => {
    const r = extractDirectApplyLink(WPJM_URL_PAGE, BOARD_PAGE);
    expect(r.url).toBe('https://boards.greenhouse.io/acme/jobs/4012');
    expect(r.email).toBeUndefined();
  });

  it('finds a mailto apply target and strips the subject', () => {
    const r = extractDirectApplyLink(WPJM_EMAIL_PAGE, BOARD_PAGE);
    expect(r.email).toBe('hr@acme.example');
    expect(r.url).toBeUndefined();
  });

  it('never returns same-site or social links', () => {
    const html = `<div class="application_details">
      <a href="https://www.club.example/job/other/">Similar job</a>
      <a href="https://jobs.club.example/x">Sub-board</a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=x">Apply via FB? no — share</a>
    </div>`;
    expect(extractDirectApplyLink(html, BOARD_PAGE)).toEqual({});
  });

  it('recognises a known-ATS link outside the apply section', () => {
    const html = `<article><p>Acme is hiring.
      <a href="https://jobs.lever.co/acme/123-abc">View the role</a></p></article>`;
    const r = extractDirectApplyLink(html, BOARD_PAGE);
    expect(r.url).toBe('https://jobs.lever.co/acme/123-abc');
  });

  it('accepts a non-ATS external link only with apply intent', () => {
    const plain = `<p><a href="https://acme.example/blog/">Our blog</a></p>`;
    expect(extractDirectApplyLink(plain, BOARD_PAGE).url).toBeUndefined();

    const intent = `<p><a href="https://acme.example/careers/role-1" target="_blank" rel="nofollow">Apply for this position</a></p>`;
    expect(extractDirectApplyLink(intent, BOARD_PAGE).url).toBe('https://acme.example/careers/role-1');
  });

  it('resolves relative apply links against the board page', () => {
    // Relative hrefs stay on the board's own host, so they are
    // never a direct employer target.
    const html = `<div class="application_details"><a href="/go/away">Apply</a></div>`;
    expect(extractDirectApplyLink(html, BOARD_PAGE)).toEqual({});
  });

  it('returns {} for unparsable board URLs and empty pages', () => {
    expect(extractDirectApplyLink(WPJM_URL_PAGE, 'nonsense')).toEqual({});
    expect(extractDirectApplyLink('', BOARD_PAGE)).toEqual({});
  });
});

describe('enrichDirectApplyLinks', () => {
  const row = (link: string) => ({
    title: 'Social Media Manager',
    apply_url: link,
    source_url: link,
  });

  it('swaps apply_url for the direct link and keeps source_url', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(WPJM_URL_PAGE, {
      status: 200, headers: { 'content-type': 'text/html' },
    }));
    const r = await enrichDirectApplyLinks([row('https://www.club.example/job/a/')], { fetchImpl: fetchImpl as any });
    expect(r.enriched).toBe(1);
    expect(r.rows[0].apply_url).toBe('https://boards.greenhouse.io/acme/jobs/4012');
    expect(r.rows[0].source_url).toBe('https://www.club.example/job/a/');
  });

  it('sets apply_email and keeps the board link when only an email exists', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(WPJM_EMAIL_PAGE, {
      status: 200, headers: { 'content-type': 'text/html' },
    }));
    const r = await enrichDirectApplyLinks([row('https://www.club.example/job/b/')], { fetchImpl: fetchImpl as any });
    expect(r.enriched).toBe(0);
    expect(r.emails).toBe(1);
    expect(r.rows[0].apply_email).toBe('hr@acme.example');
    expect(r.rows[0].apply_url).toBe('https://www.club.example/job/b/');
  });

  it('keeps the board link when the page fetch fails', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(new Response('x', { status: 404 }));
    const rows = [row('https://www.club.example/job/c/'), row('https://www.club.example/job/d/')];
    const r = await enrichDirectApplyLinks(rows, { fetchImpl: fetchImpl as any });
    expect(r.failed).toBe(2);
    expect(r.rows[0].apply_url).toBe('https://www.club.example/job/c/');
    expect(r.rows[1].apply_url).toBe('https://www.club.example/job/d/');
  });

  it('never fetches SSRF-blocked detail URLs', async () => {
    const fetchImpl = vi.fn();
    const r = await enrichDirectApplyLinks([row('http://localhost/job/x/')], { fetchImpl: fetchImpl as any });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r.fetched).toBe(0);
    expect(r.rows[0].apply_url).toBe('http://localhost/job/x/');
  });
});
