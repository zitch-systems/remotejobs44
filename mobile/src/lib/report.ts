// src/lib/report.ts — file a report against a job listing (migration_v41
// job_reports table, RLS-scoped to the reporter). Used by ReportSheet.
import { supabase } from './supabase';

export type ReportReason = 'scam' | 'spam' | 'expired' | 'inaccurate' | 'offensive' | 'other';

export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'scam', label: 'Looks like a scam' },
  { key: 'spam', label: 'Spam or duplicate' },
  { key: 'expired', label: 'Position is filled / expired' },
  { key: 'inaccurate', label: 'Misleading or inaccurate' },
  { key: 'offensive', label: 'Offensive or inappropriate' },
  { key: 'other', label: 'Something else' },
];

export async function reportJob(userId: string, jobId: string, reason: ReportReason, details?: string | null): Promise<void> {
  const { error } = await supabase.from('job_reports').insert({ user_id: userId, job_id: jobId, reason, details: details ?? null });
  if (error) throw error;
}
