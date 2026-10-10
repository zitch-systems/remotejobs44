// lib/auth/profile-fields.ts — validation for the self-editable profile fields
// the native app sends to PATCH /api/profile (skills, headline, bio, links,
// experience, avatar_url).
//
// Why a server-side validator: `authenticated` may only UPDATE profiles.name
// and updated_at (migration_v9), so these columns are written through the
// service-role client in the route. That makes this module the ONLY thing
// standing between a request body and the row — keep it strict, bounded, and
// whitelist-based. name / target_role / cv_text keep their validation inline in
// the route (they predate this module).
//
// Pure: no I/O, so it is unit-tested directly (profile-fields.test.ts).

export const PROFILE_LIMITS = {
  skills: 50,
  skillLength: 50,
  headline: 140,
  bio: 2000,
  link: 300,
  experience: 20,
  experienceTitle: 120,
  experienceCompany: 120,
  experiencePeriod: 60,
  avatarUrl: 500,
} as const;

/** The only link types the profile stores. Unknown keys are rejected, not dropped. */
export const PROFILE_LINK_KEYS = ['github', 'linkedin', 'website'] as const;

export interface ProfileExperienceItem {
  title: string;
  company: string;
  period: string;
}

export type ProfileFieldsResult =
  | { ok: true; updates: Record<string, unknown> }
  | { ok: false; error: string };

export interface ProfileFieldsContext {
  /** The authenticated user; avatar URLs must live in this user's folder. */
  userId: string;
  /** NEXT_PUBLIC_SUPABASE_URL — avatar URLs must be on this project's storage. */
  supabaseUrl: string | undefined;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

// ── text hygiene ────────────────────────────────────────────────────────────
// Postgres rejects NUL in text/jsonb and invalid UTF-8 in jsonb, and either
// surfaces as an opaque 500 — so normalise before anything reaches the column.

/** Replace unpaired UTF-16 surrogates (a JSON `\ud800` escape can smuggle one in). */
function wellFormed(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { out += s[i] + s[i + 1]; i++; }
      else out += '�';
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      out += '�';
    } else {
      out += s[i];
    }
  }
  return out;
}

/** Single-line text: control characters become spaces, whitespace collapses. */
function oneLine(s: string): string {
  return wellFormed(s).replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Multi-line text: keep line breaks and tabs, drop every other control character. */
function multiLine(s: string): string {
  return wellFormed(s)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
    .trim();
}

// ── per-field parsers ───────────────────────────────────────────────────────

function parseText(v: unknown, label: string, max: number, multiline = false): Parsed<string | null> {
  if (v === null || v === undefined) return ok(null);
  if (typeof v !== 'string') return fail(`${label} must be text`);
  if (v.length > max * 8) return fail(`${label} must be ${max.toLocaleString('en-US')} characters or fewer`);
  const text = multiline ? multiLine(v) : oneLine(v);
  if (text.length > max) return fail(`${label} must be ${max.toLocaleString('en-US')} characters or fewer`);
  return ok(text.length > 0 ? text : null);
}

function parseSkills(v: unknown): Parsed<string[]> {
  if (v === null) return ok([]);
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) return fail('Skills must be a list of text');
  if (v.length > PROFILE_LIMITS.skills * 4) return fail(`Too many skills (max ${PROFILE_LIMITS.skills})`);
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const raw of v as string[]) {
    const skill = oneLine(raw);
    if (!skill) continue;
    if (skill.length > PROFILE_LIMITS.skillLength) {
      return fail(`Each skill must be ${PROFILE_LIMITS.skillLength} characters or fewer`);
    }
    const key = skill.toLowerCase();
    if (seen.has(key)) continue; // the app already de-duplicates case-insensitively
    seen.add(key);
    skills.push(skill);
  }
  if (skills.length > PROFILE_LIMITS.skills) return fail(`Too many skills (max ${PROFILE_LIMITS.skills})`);
  return ok(skills);
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return (u.protocol === 'http:' || u.protocol === 'https:')
      && !u.username && !u.password
      && u.hostname.includes('.');
  } catch {
    return false;
  }
}

function parseLinks(v: unknown): Parsed<Record<string, string>> {
  if (v === null) return ok({});
  if (typeof v !== 'object' || Array.isArray(v)) return fail('Links must be an object');
  const links: Record<string, string> = {};
  for (const [key, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!(PROFILE_LINK_KEYS as readonly string[]).includes(key)) {
      return fail(`Unknown link type "${key.slice(0, 30)}"`);
    }
    if (raw === null || raw === undefined) continue;
    if (typeof raw !== 'string') return fail(`The ${key} link must be text`);
    const link = raw.trim();
    if (!link) continue;
    if (link.length > PROFILE_LIMITS.link) {
      return fail(`The ${key} link must be ${PROFILE_LIMITS.link} characters or fewer`);
    }
    if (/[\s\u0000-\u001f\u007f-\u009f]/.test(link) || !isHttpUrl(link)) {
      return fail(`The ${key} link must be a valid http(s) URL`);
    }
    links[key] = link;
  }
  return ok(links);
}

function parseExperience(v: unknown): Parsed<ProfileExperienceItem[]> {
  if (v === null) return ok([]);
  if (!Array.isArray(v)) return fail('Experience must be a list');
  if (v.length > PROFILE_LIMITS.experience * 4) {
    return fail(`Too many experience entries (max ${PROFILE_LIMITS.experience})`);
  }
  const items: ProfileExperienceItem[] = [];
  for (const entry of v) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return fail('Each experience entry must be an object');
    }
    const e = entry as Record<string, unknown>;
    const title = parseText(e.title, 'Experience title', PROFILE_LIMITS.experienceTitle);
    if (!title.ok) return title;
    const company = parseText(e.company, 'Experience company', PROFILE_LIMITS.experienceCompany);
    if (!company.ok) return company;
    const period = parseText(e.period, 'Experience period', PROFILE_LIMITS.experiencePeriod);
    if (!period.ok) return period;
    // A row with neither a title nor a company is a blank form row, not an error
    // (the app drops these too).
    if (!title.value && !company.value) continue;
    items.push({ title: title.value ?? '', company: company.value ?? '', period: period.value ?? '' });
  }
  if (items.length > PROFILE_LIMITS.experience) {
    return fail(`Too many experience entries (max ${PROFILE_LIMITS.experience})`);
  }
  return ok(items);
}

/**
 * A profile photo must be one the user uploaded to this project's public
 * `avatars` bucket, under their own folder. Without this, avatar_url would be an
 * arbitrary URL that every viewer's browser (and the admin console) loads.
 */
function parseAvatarUrl(v: unknown, ctx: ProfileFieldsContext): Parsed<string | null> {
  if (v === null || v === '') return ok(null);
  const invalid = 'Profile photo must be one you uploaded to your account';
  if (typeof v !== 'string' || v.length > PROFILE_LIMITS.avatarUrl) return fail(invalid);
  if (!ctx.supabaseUrl) return fail('Profile photos are unavailable right now');
  let url: URL;
  let origin: string;
  try {
    url = new URL(v);
    origin = new URL(ctx.supabaseUrl).origin;
  } catch {
    return fail(invalid);
  }
  const folder = `/storage/v1/object/public/avatars/${ctx.userId}/`;
  if (
    url.origin !== origin
    || !url.pathname.startsWith(folder)
    || url.pathname.length === folder.length
    || url.search || url.hash || url.username || url.password
  ) {
    return fail(invalid);
  }
  return ok(url.href);
}

/**
 * Validate and normalise whichever of the new fields are present in `body`.
 * Absent fields are left out of `updates`; `null` clears a field to its empty
 * value (NULL for text, `{}` / `[]` / `[]` for the NOT NULL / default columns).
 */
export function parseProfileFields(
  body: Record<string, unknown>,
  ctx: ProfileFieldsContext,
): ProfileFieldsResult {
  const updates: Record<string, unknown> = {};

  if (body.skills !== undefined) {
    const r = parseSkills(body.skills);
    if (!r.ok) return r;
    updates.skills = r.value;
  }
  if (body.headline !== undefined) {
    const r = parseText(body.headline, 'Headline', PROFILE_LIMITS.headline);
    if (!r.ok) return r;
    updates.headline = r.value;
  }
  if (body.bio !== undefined) {
    const r = parseText(body.bio, 'Bio', PROFILE_LIMITS.bio, true);
    if (!r.ok) return r;
    updates.bio = r.value;
  }
  if (body.links !== undefined) {
    const r = parseLinks(body.links);
    if (!r.ok) return r;
    updates.links = r.value;
  }
  if (body.experience !== undefined) {
    const r = parseExperience(body.experience);
    if (!r.ok) return r;
    updates.experience = r.value;
  }
  if (body.avatar_url !== undefined) {
    const r = parseAvatarUrl(body.avatar_url, ctx);
    if (!r.ok) return r;
    updates.avatar_url = r.value;
  }

  return { ok: true, updates };
}
