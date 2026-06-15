// src/lib/profile-details.ts — structured profile (bio, links, work experience).
// Pure types + helpers; the Supabase fetch/save lives in lib/profile.ts so this
// stays unit-testable.

export interface ExperienceItem {
  title: string;
  company: string;
  period: string;
}

export interface ProfileLinks {
  github?: string;
  linkedin?: string;
  website?: string;
}

export interface ProfileDetails {
  bio: string;
  links: ProfileLinks;
  experience: ExperienceItem[];
}

export const EMPTY_DETAILS: ProfileDetails = { bio: '', links: {}, experience: [] };

/** Add https:// to a bare domain; an empty string stays empty. */
export function normalizeUrl(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** Trim entries and drop blank rows (no title and no company). */
export function cleanExperience(items: ExperienceItem[]): ExperienceItem[] {
  return items
    .map((e) => ({ title: (e.title ?? '').trim(), company: (e.company ?? '').trim(), period: (e.period ?? '').trim() }))
    .filter((e) => e.title || e.company);
}

/** Drop empty link values so we don't store `{ github: '' }`. */
export function cleanLinks(links: ProfileLinks): ProfileLinks {
  const out: ProfileLinks = {};
  if (links.github) out.github = links.github;
  if (links.linkedin) out.linkedin = links.linkedin;
  if (links.website) out.website = links.website;
  return out;
}
