import { describe, expect, it } from 'vitest';
import { PROFILE_LIMITS, parseProfileFields } from './profile-fields';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SUPABASE = 'https://abcdefgh.supabase.co';
const ctx = { userId: USER, supabaseUrl: SUPABASE };
const avatar = (uid = USER, file = 'avatar-1700000000.jpg') =>
  `${SUPABASE}/storage/v1/object/public/avatars/${uid}/${file}`;

const parse = (body: Record<string, unknown>, c = ctx) => parseProfileFields(body, c);
const updates = (body: Record<string, unknown>) => {
  const r = parse(body);
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.updates;
};
const error = (body: Record<string, unknown>) => {
  const r = parse(body);
  if (r.ok) throw new Error('expected an error');
  return r.error;
};

describe('parseProfileFields — whitelist', () => {
  it('returns nothing for a body without the new fields', () => {
    expect(updates({})).toEqual({});
  });

  it('never passes through privileged or unknown columns', () => {
    expect(updates({
      role: 'admin', plan: 'pro', plan_expires_at: '2099-01-01', suspended: false, id: OTHER, cv_url: 'x/y.pdf',
      email: 'someone@else.test', bio: 'hello',
    })).toEqual({ bio: 'hello' });
  });
});

describe('skills', () => {
  it('trims, drops blanks and de-duplicates case-insensitively, keeping the first spelling', () => {
    expect(updates({ skills: ['  React ', 'react', '', '   ', 'Node.js', 'REACT'] }).skills).toEqual(['React', 'Node.js']);
  });

  it('collapses control characters and whitespace inside a skill', () => {
    expect(updates({ skills: ['Type\u0000Script\n', 'a\t\tb'] }).skills).toEqual(['Type Script', 'a b']);
  });

  it('clears with null or an empty list', () => {
    expect(updates({ skills: null }).skills).toEqual([]);
    expect(updates({ skills: [] }).skills).toEqual([]);
  });

  it('rejects non-lists, non-text items, over-long skills and too many skills', () => {
    expect(error({ skills: 'react' })).toMatch(/list of text/);
    expect(error({ skills: ['ok', 3] })).toMatch(/list of text/);
    expect(error({ skills: ['x'.repeat(PROFILE_LIMITS.skillLength + 1)] })).toMatch(/50 characters/);
    expect(error({ skills: Array.from({ length: PROFILE_LIMITS.skills + 1 }, (_, i) => `skill-${i}`) })).toMatch(/Too many skills/);
    expect(error({ skills: Array.from({ length: 500 }, (_, i) => `skill-${i}`) })).toMatch(/Too many skills/);
  });

  it('accepts exactly the maximum', () => {
    const skills = Array.from({ length: PROFILE_LIMITS.skills }, (_, i) => `skill-${i}`);
    expect(updates({ skills }).skills).toHaveLength(PROFILE_LIMITS.skills);
  });
});

describe('headline and bio', () => {
  it('stores a trimmed single-line headline and clears on empty or null', () => {
    expect(updates({ headline: '  Senior\nEngineer  ' }).headline).toBe('Senior Engineer');
    expect(updates({ headline: '   ' }).headline).toBeNull();
    expect(updates({ headline: null }).headline).toBeNull();
  });

  it('keeps line breaks in a bio, normalises CRLF and strips other control characters', () => {
    expect(updates({ bio: 'Line one\r\nLine two\u0000\u0007\n\nLine three  ' }).bio).toBe('Line one\nLine two\n\nLine three');
    expect(updates({ bio: '' }).bio).toBeNull();
  });

  it('replaces unpaired surrogates so Postgres never sees invalid text', () => {
    expect(updates({ bio: 'ok \ud83d broken' }).bio).toBe('ok � broken');
    expect(updates({ bio: 'emoji 😀 fine' }).bio).toBe('emoji 😀 fine');
  });

  it('enforces the length limits and the type', () => {
    expect(error({ headline: 'h'.repeat(PROFILE_LIMITS.headline + 1) })).toMatch(/Headline must be 140/);
    expect(error({ bio: 'b'.repeat(PROFILE_LIMITS.bio + 1) })).toMatch(/Bio must be 2,000/);
    expect(error({ bio: 'b'.repeat(PROFILE_LIMITS.bio * 9) })).toMatch(/Bio must be 2,000/);
    expect(error({ bio: 42 })).toMatch(/Bio must be text/);
    expect(updates({ bio: 'b'.repeat(PROFILE_LIMITS.bio) }).bio).toHaveLength(PROFILE_LIMITS.bio);
  });
});

describe('links', () => {
  it('accepts http(s) links for the three known types and drops empty ones', () => {
    expect(updates({
      links: { github: 'https://github.com/octocat', linkedin: ' https://www.linkedin.com/in/octo ', website: '' },
    }).links).toEqual({ github: 'https://github.com/octocat', linkedin: 'https://www.linkedin.com/in/octo' });
    expect(updates({ links: { website: null } }).links).toEqual({});
    expect(updates({ links: null }).links).toEqual({});
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'ftp://example.com/x',
    'mailto:a@b.co',
    '//example.com',
    'example.com',
    'https://user:pass@example.com/',
    'https://localhost/',
    'https://exa mple.com',
    'https://example.com/\nsecond-line',
  ])('rejects %j', (website) => {
    expect(error({ links: { website } })).toMatch(/website link must be a valid http\(s\) URL/);
  });

  it('rejects unknown link types, non-objects, non-text values and over-long links', () => {
    expect(error({ links: { twitter: 'https://x.com/a' } })).toMatch(/Unknown link type "twitter"/);
    expect(error({ links: ['https://github.com/a'] })).toMatch(/must be an object/);
    expect(error({ links: 'https://github.com/a' })).toMatch(/must be an object/);
    expect(error({ links: { github: 5 } })).toMatch(/github link must be text/);
    expect(error({ links: { github: `https://github.com/${'a'.repeat(PROFILE_LIMITS.link)}` } })).toMatch(/300 characters/);
  });
});

describe('experience', () => {
  it('keeps title, company and period only, trimmed, and drops blank rows', () => {
    expect(updates({
      experience: [
        { title: '  Engineer ', company: 'Acme', period: '2020 – 2024', extra: 'ignored', role: 'admin' },
        { title: '', company: '   ', period: '2019' },
        { title: 'Intern', company: '', period: '' },
      ],
    }).experience).toEqual([
      { title: 'Engineer', company: 'Acme', period: '2020 – 2024' },
      { title: 'Intern', company: '', period: '' },
    ]);
  });

  it('clears with null', () => {
    expect(updates({ experience: null }).experience).toEqual([]);
  });

  it('rejects malformed entries, over-long fields and too many entries', () => {
    expect(error({ experience: 'Engineer' })).toMatch(/must be a list/);
    expect(error({ experience: ['Engineer'] })).toMatch(/must be an object/);
    expect(error({ experience: [null] })).toMatch(/must be an object/);
    expect(error({ experience: [{ title: 5 }] })).toMatch(/Experience title must be text/);
    expect(error({ experience: [{ title: 'x'.repeat(PROFILE_LIMITS.experienceTitle + 1) }] })).toMatch(/120 characters/);
    expect(error({ experience: [{ title: 'ok', period: 'p'.repeat(PROFILE_LIMITS.experiencePeriod + 1) }] })).toMatch(/period must be 60/);
    const many = Array.from({ length: PROFILE_LIMITS.experience + 1 }, (_, i) => ({ title: `Role ${i}`, company: 'Co', period: '' }));
    expect(error({ experience: many })).toMatch(/Too many experience entries/);
  });
});

describe('avatar_url', () => {
  it('accepts a public avatar in the caller’s own folder and normalises it', () => {
    expect(updates({ avatar_url: avatar() }).avatar_url).toBe(avatar());
    expect(updates({ avatar_url: avatar().replace('https://', 'HTTPS://').replace('abcdefgh', 'ABCDEFGH') }).avatar_url).toBe(avatar());
  });

  it('clears with null or an empty string', () => {
    expect(updates({ avatar_url: null }).avatar_url).toBeNull();
    expect(updates({ avatar_url: '' }).avatar_url).toBeNull();
  });

  it.each([
    ['another user’s folder', avatar(OTHER)],
    ['a different host', `https://evil.example/storage/v1/object/public/avatars/${USER}/a.jpg`],
    ['a look-alike host', `https://abcdefgh.supabase.co.evil.example/storage/v1/object/public/avatars/${USER}/a.jpg`],
    ['another bucket', `${SUPABASE}/storage/v1/object/public/cvs/${USER}/a.pdf`],
    ['a path traversal', `${SUPABASE}/storage/v1/object/public/avatars/${USER}/../${OTHER}/a.jpg`],
    ['an encoded path traversal', `${SUPABASE}/storage/v1/object/public/avatars/${USER}/%2e%2e/${OTHER}/a.jpg`],
    ['the folder itself', `${SUPABASE}/storage/v1/object/public/avatars/${USER}/`],
    ['a query string', `${avatar()}?download=1`],
    ['a fragment', `${avatar()}#x`],
    ['credentials', avatar().replace('https://', 'https://user:pw@')],
    ['http', avatar().replace('https://', 'http://')],
    ['a javascript URL', 'javascript:alert(1)'],
    ['not a URL', 'avatar.jpg'],
  ])('rejects %s', (_label, value) => {
    expect(error({ avatar_url: value })).toMatch(/uploaded to your account/);
  });

  it('rejects non-text and over-long values', () => {
    expect(error({ avatar_url: 5 })).toMatch(/uploaded to your account/);
    expect(error({ avatar_url: `${avatar()}${'a'.repeat(PROFILE_LIMITS.avatarUrl)}` })).toMatch(/uploaded to your account/);
  });

  it('refuses every URL when the project URL is not configured', () => {
    const r = parseProfileFields({ avatar_url: avatar() }, { userId: USER, supabaseUrl: undefined });
    expect(r).toEqual({ ok: false, error: 'Profile photos are unavailable right now' });
  });
});

describe('several fields at once', () => {
  it('returns every validated field together', () => {
    expect(updates({
      skills: ['React'],
      headline: 'Engineer',
      bio: 'Hi',
      links: { github: 'https://github.com/octocat' },
      experience: [{ title: 'Dev', company: 'Acme', period: '2024' }],
      avatar_url: avatar(),
    })).toEqual({
      skills: ['React'],
      headline: 'Engineer',
      bio: 'Hi',
      links: { github: 'https://github.com/octocat' },
      experience: [{ title: 'Dev', company: 'Acme', period: '2024' }],
      avatar_url: avatar(),
    });
  });

  it('fails the whole request on the first invalid field, writing nothing', () => {
    expect(error({ bio: 'fine', links: { website: 'javascript:alert(1)' } })).toMatch(/website link/);
  });
});
