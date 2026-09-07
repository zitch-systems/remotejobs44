// lib/types.ts – RemoteJobs44 shared types

export type Theme = 'light' | 'dark' | 'system';
export type Locale = 'en' | 'fr' | 'es' | 'de' | 'pt' | 'ar' | 'zh' | 'ja';
export type UserPlan = 'free' | 'daily' | 'pro' | 'admin';
export type UserRole = 'user' | 'admin' | 'agent';

export interface User {
  id: string;
  name: string;
  email: string;
  plan: UserPlan;
  role: UserRole;
  avatar?: string;
  joinedAt: string;
  profileCompletion?: number;
}

export type JobCategory =
  | 'engineering' | 'design' | 'marketing' | 'finance'
  | 'sales' | 'data' | 'hr' | 'product' | 'legal' | 'operations' | 'other';

export type JobType = 'full-time' | 'part-time' | 'contract' | 'freelance';
export type JobSource = 'rss' | 'scrape' | 'manual' | 'embedded-rss' | 'custom-rss' | 'api';
export type JobLevel = 'entry' | 'mid' | 'senior' | 'lead' | 'executive';

export interface Job {
  id: string;
  title: string;
  company: string;
  companyId?: string;
  logo?: string;
  category: JobCategory;
  type: JobType;
  level?: JobLevel;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  location: string;
  timezone?: string;
  description: string;
  requirements?: string[];
  skills?: string[];
  benefits?: string[];
  applyUrl?: string;
  applyEmail?: string;
  posted: string;
  expires?: string;
  featured: boolean;
  isNew: boolean;
  source: JobSource;
  sourceUrl?: string;
  views?: number;
  applications?: number;
  remote: boolean;
  // Moderation state. Only ever populated for admin callers — the public
  // listing filters flagged and inactive rows out before they reach a client.
  isActive?: boolean;
  flagged?: boolean;
  flaggedReason?: string | null;
}

export interface Company {
  id: string;
  name: string;
  logo?: string;
  country: string;
  countryCode: string;
  description?: string;
  website?: string;
  size?: string;
  categories: JobCategory[];
  jobCount: number;
  rssUrl?: string;
  scrapeUrl?: string;
  featured?: boolean;
  specializations?: string[];
}

export type ApplicationStatus = 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn';

export interface ApplicationStep {
  label: string;
  done: boolean;
  date?: string;
}

export interface Application {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  companyLogo?: string;
  status: ApplicationStatus;
  appliedAt: string;
  updatedAt: string;
  steps: ApplicationStep[];
  notes?: string;
  autoApplied?: boolean;
}

export interface JobSourceRecord {
  id: string;
  name: string;
  type: 'rss' | 'scrape' | 'embedded-rss' | 'manual';
  url?: string;
  status: 'active' | 'error' | 'pending' | 'disabled';
  lastSync?: string;
  jobsAdded: number;
  jobsUpdated?: number;
  syncInterval?: number;
  createdAt: string;
  companyId?: string;
  errorMessage?: string;
}

export interface Subscription {
  id: string;
  plan: UserPlan;
  billing: 'daily' | 'monthly' | 'annually';
  price: number;
  currency: string;
  startedAt: string;
  expiresAt?: string;
  paystackCustomerCode?: string;
  paystackSubscriptionCode?: string;
  status: 'active' | 'cancelled' | 'past_due';
}

// Plans: daily=₦500 | pro_monthly=₦2,999 | pro_annual=₦29,999
export interface PricingPlan {
  id: string;
  name: string;
  nairaPrice: number;        // in Naira
  nairaMonthlyEquiv?: number; // shown for annual plans
  billing: 'daily' | 'monthly' | 'annually';
  description: string;
  features: { text: string; included: boolean }[];
  cta: string;
  popular?: boolean;
  badge?: string;
}

export interface SearchFilters {
  q?: string;
  category?: JobCategory | 'all';
  type?: JobType | '';
  level?: JobLevel | '';
  location?: string;
  region?: string;
  country?: string;
  source?: string | '';
  sort?: 'newest' | 'salary' | 'relevant';
  page?: number;
  perPage?: number;
  remote?: boolean;
  // Optional advanced filters — forwarded to /api/jobs and applied server-side.
  salary?: string;     // range key like "60-100" (means salary_max between 60k–100k)
  timezone?: string;   // matches jobs.timezone column substring
  posted?: string;     // "1" | "7" | "14" | "30" — days since posted_at
}

export interface PaginatedJobs {
  jobs: Job[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
}

export interface AdminStats {
  totalJobs: number;
  newToday: number;
  activeUsers: number;
  subscriptions: number;
  sources: number;
  revenue?: number;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}
