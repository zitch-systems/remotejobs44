// src/lib/types.ts — domain types for the mobile app.
// Mirrors the handoff's seed `JOBS` model. When wiring to live data, map the
// Supabase `jobs` row onto this shape (or generate types from the DB).

export type AppStatus = 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn';

export interface MatchBar {
  label: string; // e.g. "Skills"
  value: string; // e.g. "Excellent"
  pct: number; // 0–100 fill
}

export interface JobTag {
  label: string;
  variant: 'default' | 'blue';
}

export interface Job {
  id: string;
  role: string;
  company: string;
  logo: string; // single-letter initial for the gradient tile (fallback)
  logoUrl?: string; // real company logo image, when available
  grad: [string, string]; // company tile gradient [from, to]
  match: number; // 0–100 match score
  category: string;
  verified: boolean;
  salary: string; // "$140k" / "₦18m"
  per: '/yr' | '/mo';
  time: string; // "2d ago"
  location: string;
  type: string; // Full-time / Contract
  level: string; // Senior / Mid
  applyUrl?: string; // external apply link (company site), when available
  applyEmail?: string; // apply-by-email address, when available
  tags: JobTag[];
  about: string;
  duties: string[];
  skills: string[];
  verdict: string; // headline of the match verdict
  vcap: string; // caption under the verdict
  breakdown: MatchBar[]; // 3 bars for the detailed match band
}

export const STATUS_LABEL: Record<AppStatus, string> = {
  applied: 'Applied',
  screening: 'In review',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
};

// The stages a user can set from the Applications tracker, in order.
export const STATUS_FLOW: AppStatus[] = ['applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];

export type NotificationType = 'job_alert' | 'application' | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  jobId: string | null;
  read: boolean;
  createdAt: string | null;
}
