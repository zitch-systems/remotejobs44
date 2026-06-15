// src/lib/user-state.ts — per-user saved + application persistence (pure async
// helpers; no React/store imports so the store can depend on it cleanly).
// RLS scopes every row to auth.uid(); we still pass user_id explicitly.
import { supabase } from './supabase';
import { rowToJob } from './jobs';
import { dbToStatus } from './format';
import type { AppStatus, Job } from './types';

// Re-export so existing importers keep working.
export { dbToStatus } from './format';

const JOB_COLUMNS =
  'id,title,company,logo,category,type,level,location,description,requirements,skills,salary_min,salary_max,currency,remote,featured,posted_at';

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
  if (save) {
    // unique(user_id, job_id) makes this idempotent.
    const { error } = await supabase.from('saved_jobs').upsert({ user_id: userId, job_id: jobId }, { onConflict: 'user_id,job_id' });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('saved_jobs').delete().eq('user_id', userId).eq('job_id', jobId);
    if (error) throw error;
  }
}

export async function applyRemote(userId: string, job: Job): Promise<void> {
  const { error } = await supabase.from('applications').insert({
    user_id: userId,
    job_id: job.id,
    job_title: job.role,
    company: job.company,
    status: 'applied',
  });
  if (error) throw error;
}

export interface ApplicationItem {
  job: Job;
  status: AppStatus;
}

/** Authoritative tracker data: applications joined to their jobs. */
export async function fetchApplicationItems(userId: string): Promise<ApplicationItem[]> {
  const { data, error } = await supabase
    .from('applications')
    .select(`status, jobs(${JOB_COLUMNS})`)
    .eq('user_id', userId)
    .order('applied_at', { ascending: false });
  if (error) throw error;
  const items: ApplicationItem[] = [];
  for (const row of (data ?? []) as any[]) {
    if (!row.jobs) continue;
    items.push({ job: rowToJob(row.jobs), status: dbToStatus(row.status) });
  }
  return items;
}

/** The user's saved jobs, newest first. */
export async function fetchSavedJobs(userId: string): Promise<Job[]> {
  const { data, error } = await supabase
    .from('saved_jobs')
    .select(`jobs(${JOB_COLUMNS})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const jobs: Job[] = [];
  for (const row of (data ?? []) as any[]) if (row.jobs) jobs.push(rowToJob(row.jobs));
  return jobs;
}
