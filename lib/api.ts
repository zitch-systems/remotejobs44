// lib/api.ts  –  Stage-1 mock; swap BASE_URL + remove mock* for real backend
import type { Job, User, Application, SearchFilters, PaginatedJobs, AdminStats } from './types';
import { MOCK_JOBS, MOCK_COMPANIES } from './mock-data';
import { uid, sleep, validateEmail } from './utils';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

// ── helpers ────────────────────────────────────────────────────────────────
async function http<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE_URL + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Request failed');
  return data as T;
}

// ── Auth ───────────────────────────────────────────────────────────────────
export const authApi = {
  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    await sleep(600);
    if (!validateEmail(email)) throw new Error('Invalid email address');
    if (password.length < 6) throw new Error('Invalid email or password');
    const isAdmin = email.includes('admin');
    const user: User = {
      id: uid(),
      name: email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      email, plan: isAdmin ? 'admin' : 'free',
      role: isAdmin ? 'admin' : 'user',
      joinedAt: new Date().toISOString(),
      profileCompletion: 40,
    };
    return { user, token: 'mock_' + uid() };
  },

  async register(name: string, email: string, password: string): Promise<{ user: User; token: string }> {
    await sleep(700);
    if (!name.trim()) throw new Error('Name is required');
    if (!validateEmail(email)) throw new Error('Invalid email address');
    if (password.length < 8) throw new Error('Password must be at least 8 characters');
    const user: User = {
      id: uid(), name: name.trim(), email,
      plan: 'free', role: 'user',
      joinedAt: new Date().toISOString(),
      profileCompletion: 20,
    };
    return { user, token: 'mock_' + uid() };
  },
};

// ── Jobs ───────────────────────────────────────────────────────────────────
export const jobsApi = {
  async getJobs(filters: SearchFilters = {}): Promise<PaginatedJobs> {
    await sleep(250);
    let jobs = [...MOCK_JOBS];
    if (filters.q) {
      const q = filters.q.toLowerCase();
      jobs = jobs.filter((j) =>
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        j.skills?.some((s) => s.toLowerCase().includes(q))
      );
    }
    if (filters.category && filters.category !== 'all') {
      jobs = jobs.filter((j) => j.category === filters.category);
    }
    if (filters.type) jobs = jobs.filter((j) => j.type === filters.type);
    if (filters.level) jobs = jobs.filter((j) => j.level === filters.level);
    if (filters.source) jobs = jobs.filter((j) => j.source === filters.source);
    if (filters.sort === 'salary') {
      jobs.sort((a, b) => (b.salaryMax ?? 0) - (a.salaryMax ?? 0));
    } else {
      jobs.sort((a, b) => new Date(b.posted).getTime() - new Date(a.posted).getTime());
      jobs.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }
    const page = filters.page ?? 1;
    const perPage = filters.perPage ?? 10;
    const total = jobs.length;
    const data = jobs.slice((page - 1) * perPage, page * perPage);
    return { jobs: data, total, page, perPage, pages: Math.ceil(total / perPage) };
  },

  async getJob(id: string): Promise<Job | null> {
    await sleep(150);
    return MOCK_JOBS.find((j) => j.id === id) ?? null;
  },

  async createJob(data: Partial<Job>): Promise<Job> {
    await sleep(500);
    const job: Job = {
      id: 'j' + uid(), source: 'manual', posted: new Date().toISOString(),
      featured: false, isNew: true, remote: true, location: 'Worldwide',
      description: '', company: '', title: '', category: 'other', type: 'full-time',
      ...data,
    };
    MOCK_JOBS.unshift(job);
    return job;
  },

  async deleteJob(id: string): Promise<void> {
    const idx = MOCK_JOBS.findIndex((j) => j.id === id);
    if (idx >= 0) MOCK_JOBS.splice(idx, 1);
  },

  async updateJob(id: string, data: Partial<Job>): Promise<Job | null> {
    const idx = MOCK_JOBS.findIndex((j) => j.id === id);
    if (idx < 0) return null;
    MOCK_JOBS[idx] = { ...MOCK_JOBS[idx], ...data };
    return MOCK_JOBS[idx];
  },
};

// ── Applications ───────────────────────────────────────────────────────────
export const applicationsApi = {
  async apply(jobId: string, cvUrl?: string): Promise<Application> {
    await sleep(600);
    const job = await jobsApi.getJob(jobId);
    if (!job) throw new Error('Job not found');
    return {
      id: uid(), jobId, jobTitle: job.title, company: job.company,
      companyLogo: job.logo,
      status: 'applied',
      appliedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      autoApplied: !!cvUrl,
      steps: [
        { label: 'Applied', done: true, date: new Date().toISOString() },
        { label: 'Screening', done: false },
        { label: 'Interview', done: false },
        { label: 'Decision', done: false },
      ],
    };
  },
};

// ── Companies ──────────────────────────────────────────────────────────────
export const companiesApi = {
  async getCompanies(filters: { country?: string; q?: string; category?: string } = {}) {
    await sleep(200);
    let companies = [...MOCK_COMPANIES];
    if (filters.country) companies = companies.filter((c) => c.countryCode === filters.country);
    if (filters.category) companies = companies.filter((c) => (c.categories as string[]).includes(filters.category!));
    if (filters.q) {
      const q = filters.q.toLowerCase();
      companies = companies.filter((c) => c.name.toLowerCase().includes(q));
    }
    return { companies, total: companies.length };
  },
};

// ── Admin ──────────────────────────────────────────────────────────────────
export const adminApi = {
  async getStats(): Promise<AdminStats> {
    await sleep(200);
    return { totalJobs: 12_843, newToday: 127, activeUsers: 5_420, subscriptions: 1_230, sources: 24, revenue: 11_070 };
  },
};

// ── Subscriptions ─────────────────────────────────────────────────────────
export const subscriptionApi = {
  async createCheckout(plan: string, billing: 'monthly' | 'annually'): Promise<{ url?: string; success: boolean }> {
    await sleep(800);
    // In production: call Stripe checkout session endpoint
    return { success: true, url: `#/pricing?success=1&plan=${plan}` };
  },
};
