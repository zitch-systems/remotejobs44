// src/lib/apply.ts — pure helper to resolve a job's external apply target.
// A job may carry an apply_url (company site) or an apply_email; otherwise the
// app uses its in-app one-tap apply. Kept pure for unit testing.
import type { Job } from './types';

export type ApplyTarget = { type: 'url'; value: string } | { type: 'email'; value: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Prefer a valid http(s) apply URL, then a valid apply email, else null. */
export function applyTarget(job: Pick<Job, 'applyUrl' | 'applyEmail'>): ApplyTarget | null {
  const url = (job.applyUrl ?? '').trim();
  if (/^https?:\/\//i.test(url)) return { type: 'url', value: url };
  const email = (job.applyEmail ?? '').trim();
  if (EMAIL_RE.test(email)) return { type: 'email', value: email };
  return null;
}
