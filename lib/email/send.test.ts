import { describe, it, expect } from 'vitest';
import { htmlToText } from './send';

// Every message we send now ships a plain-text alternative derived from the
// HTML when the caller doesn't supply one. HTML-only bodies score badly with
// spam filters and render empty in text-only clients — and this domain's
// deliverability is load-bearing for signup confirmation and password reset.
describe('htmlToText', () => {
  it('strips markup and collapses whitespace', () => {
    expect(htmlToText('<div style="color:red">  Hello   <b>world</b>  </div>'))
      .toBe('Hello world');
  });

  it('keeps link destinations — a text part with no URLs is worse than none', () => {
    const out = htmlToText('<a href="https://remotejobs44.com/jobs">Browse Jobs</a>');
    expect(out).toContain('https://remotejobs44.com/jobs');
    expect(out).toContain('Browse Jobs');
  });

  it('does not repeat the URL when the label already is the URL', () => {
    const url = 'https://remotejobs44.com/auth/callback?token_hash=abc';
    expect(htmlToText(`<a href="${url}">${url}</a>`)).toBe(url);
  });

  it('turns block boundaries into line breaks', () => {
    expect(htmlToText('<p>One</p><p>Two</p>')).toBe('One\nTwo');
    expect(htmlToText('First<br>Second')).toBe('First\nSecond');
  });

  it('bullets list items', () => {
    expect(htmlToText('<ul><li>Alpha</li><li>Beta</li></ul>')).toBe('• Alpha\n• Beta');
  });

  it('drops head and style/script blocks rather than dumping their contents', () => {
    const html = '<head><title>x</title></head><style>.a{color:red}</style><p>Body</p>';
    expect(htmlToText(html)).toBe('Body');
  });

  it('decodes the entities our escapeHtml() introduces, so names read correctly', () => {
    // welcomeEmail() escapes the user-supplied name before splicing it in;
    // the text part must not show the raw entity to the recipient.
    expect(htmlToText('<p>Welcome, Ada &amp; Co!</p>')).toBe('Welcome, Ada & Co!');
    expect(htmlToText('<p>&quot;quoted&quot; &#39;and&#39; &lt;tagged&gt;</p>'))
      .toBe('"quoted" \'and\' <tagged>');
  });

  it('collapses runs of blank lines from nested block markup', () => {
    expect(htmlToText('<div><p>A</p></div><div><p></p></div><div><p>B</p></div>'))
      .toBe('A\n\nB');
  });

  it('trims indentation so table layouts do not leave space-only lines', () => {
    // Templates are indented table markup, so each `</tr>` newline is followed
    // by the next row's leading whitespace. Those lines are not empty — only
    // spaces — so without a per-line trim the blank-run collapse above skips
    // them and the text part comes out full of gaps.
    const html = `
      <table>
        <tr><td>A</td></tr>
        <tr><td>B</td></tr>
      </table>`;
    const out = htmlToText(html);
    expect(out).toBe('A\n\nB');
    // The real invariant: no line is whitespace-only. Such lines look blank
    // but defeat the \n{3,} collapse, so gaps grow without bound.
    expect(out.split('\n').every(l => l === l.trim())).toBe(true);
  });

  it('drops the hidden preheader block and its zero-width padding', () => {
    // The inbox-preview line is padded with ~30 joiner entities so the client
    // can't pull body copy in after it; left in, every text part would open
    // with that debris.
    const html = '<div data-preheader="1" style="display:none">Preview line&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div><p>Body</p>';
    expect(htmlToText(html)).toBe('Body');
  });
});
