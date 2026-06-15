// src/lib/ai.ts — AI CV review. Calls the Supabase edge function
// `ai-cv-review` (supabase/functions/ai-cv-review), which authenticates the
// user via the JWT that functions.invoke attaches automatically.
import { supabase } from './supabase';

export interface CvReview {
  overall_score: number;
  headline_summary: string;
  strengths: string[];
  gaps: string[];
  rewrite_tips: { section: string; tip: string }[];
  ats_keywords_missing: string[];
}

export async function reviewCv(cv: string, role: string): Promise<CvReview> {
  const { data, error } = await supabase.functions.invoke('ai-cv-review', { body: { cv, role } });
  if (error) throw new Error(error.message ?? 'AI review failed.');
  if (data?.error) throw new Error(data.error);
  return data.review as CvReview;
}
