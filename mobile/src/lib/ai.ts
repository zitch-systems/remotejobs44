// src/lib/ai.ts — AI features. Each calls a Supabase edge function
// (supabase/functions/*), which authenticates the user via the JWT that
// functions.invoke attaches automatically.
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

export interface InterviewQuestion {
  q: string;
  tip: string;
}
export interface InterviewPrep {
  behavioural: InterviewQuestion[];
  technical: InterviewQuestion[];
  remote: InterviewQuestion[];
  red_flags: string[];
}

export async function prepInterview(role: string, level: string): Promise<InterviewPrep> {
  const { data, error } = await supabase.functions.invoke('ai-interview-prep', { body: { role, level } });
  if (error) throw new Error(error.message ?? 'AI interview prep failed.');
  if (data?.error) throw new Error(data.error);
  return data.prep as InterviewPrep;
}

