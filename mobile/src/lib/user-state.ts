// src/lib/user-state.ts — per-user saved + application persistence (pure async
// helpers; no React/store imports so the store can depend on it cleanly).
// RLS scopes every row to auth.uid(); we still pass user_id explicitly.
import { supabase } from './supabase';
import { fetchJobsByIds } from './jobs';
import { dbToStatus } from './format';
import type { AppStatus, Job } from './types';

// Re-export so existing importers keep working.
export { dbToStatus } from './format';

// jobs.id / applications.job_id are uuid columns. If the app ever falls back to
// the seed set (string ids like "1") and the user saves/applies, sending a
// non-uuid job_id makes PostgREST reject the whole write with a 400. Guard the
// writes so a seed/demo job can never trigger that — they no-op remotely (the
// optimistic local state still updates).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: string): boolean => UUID_RE.test(s);

export async function fetchSavedIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('saved_jobs').select('job_id').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r: { job_id: string }) => r.job_id);
}

export async function fetchAppliedMap(userId: string): Promise<Record<string, AppStatus>> {
  const { data, error } = await supabase.from('applications').select('job_id,status').eq('user_id', userId);
  if (error) throw error;
  const map: Record<string, AppStatus> = {};
  for (const r of (data ?? []) as { job_id: string; status: string }[]) map[r.job_id] = dbToStatus(r.status);
  return map;
}

export async function setSavedRemote(userId: string, jobId: string, save: boolean): Promise<void> {
  if (!isUuid(jobId)) return; // seed/demo job — nothing to persist remotely.
  if (save) {
    // unique(user_id, job_id) + ON CONFLICT DO NOTHING makes this idempotent.
    // ignoreDuplicates matters: the default (merge-duplicates) turns a repeat
    // save into ON CONFLICT DO UPDATE, and saved_jobs has no UPDATE policy, so
    // re-saving a job that is already saved (on the web, another device, or an
    // earlier attempt whose response was lost) failed RLS with 42501 and the
    // optimistic bookmark was rolled back although the row exists.
    const { error } = await supabase
      .from('saved_jobs')
      .upsert({ user_id: userId, job_id: jobId }, { onConflict: 'user_id,job_id', ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('saved_jobs').delete().eq('user_id', userId).eq('job_id', jobId);
    if (error) throw error;
  }
}

export async function applyRemote(userId: string, job: Job): Promise<void> {
  if (!isUuid(job.id)) return; // seed/demo job — nothing to persist remotely.
  const { error } = await supabase.from('applications').insert({
    user_id: userId,
    job_id: job.id,
    status: 'applied',
  });
  if (error) throw error;
}

/** Update the status of an existing application. */
export async function updateApplicationStatus(userId: string, jobId: string, status: AppStatus): Promise<void> {
  const { error } = await supabase.from('applications').update({ status }).eq('user_id', userId).eq('job_id', jobId);
  if (error) throw error;
}

/** Save the free-text note on an application (migration_v46). */
export async function updateApplicationNote(userId: string, jobId: string, notes: string): Promise<void> {
  const { error } = await supabase.from('applications').update({ notes }).eq('user_id', userId).eq('job_id', jobId);
  if (error) throw error;
}

export interface ApplicationItem {
  job: Job;
  status: AppStatus;
  notes: string | null;
  /** ISO timestamp the user applied (applications.applied_at). */
  appliedAt: string | null;
}

type ApplicationRow = { job_id: string; job_title: string | null; status: string; notes: string | null; applied_at: string | null };

export function unavailableApplicationJob(jobId: string, storedTitle: string | null | undefined): Job {
  const candidate = storedTitle?.trim() ?? '';
  const role = candidate && !/https?:\/\/|www\.|\S+@\S+/i.test(candidate) ? candidate : 'Archived role';
  return {
    id: jobId, role, company: 'Hidden Company', logo: '?', grad: ['#475569', '#64748b'],
    match: 0, category: 'Archived', verified: false, salary: 'Unavailable', per: '/yr',
    time: 'unavailable', location: 'Listing unavailable', type: 'Archived', level: 'Not specified',
    workplaceType: 'unknown', relocationSupported: false, visaSponsorship: false,
    tags: [], about: 'This job is no longer available, but your application remains in the tracker.',
    duties: [], skills: [], verdict: 'Historical application', vcap: 'The original listing is unavailable.',
    breakdown: [], unavailable: true,
  };
}

export function mergeApplicationRows(rows: ApplicationRow[], jobs: Job[]): ApplicationItem[] {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  return rows.map((row) => ({
    job: byId.get(row.job_id) ?? unavailableApplicationJob(row.job_id, row.job_title),
    status: dbToStatus(row.status),
    notes: row.notes ?? null,
    appliedAt: row.applied_at ?? null,
  }));
}

/** Authoritative tracker data: applications joined to their jobs. */
export async function fetchApplicationItems(userId: string): Promise<ApplicationItem[]> {
  const { data, error } = await supabase
    .from('applications')
    .select('job_id,job_title,status,notes,applied_at')
    .eq('user_id', userId)
    .order('applied_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as ApplicationRow[];
  const jobs = await fetchJobsByIds(rows.map((row) => row.job_id));
  return mergeApplicationRows(rows, jobs);
}

/** The user's saved jobs, newest first. */
export async function fetchSavedJobs(userId: string): Promise<Job[]> {
  const { data, error } = await supabase
    .from('saved_jobs')
    .select('job_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return fetchJobsByIds((data ?? []).map((row: { job_id: string }) => row.job_id));
}
