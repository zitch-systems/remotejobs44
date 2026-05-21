// lib/api.ts — Hybrid API: Supabase when available, mock data as fallback
import type { Job, User, Application, SearchFilters, PaginatedJobs, AdminStats } from './types';
import { MOCK_JOBS, MOCK_COMPANIES } from './mock-data';
import { uid, sleep, validateEmail } from './utils';

// ── Auth ───────────────────────────────────────────────────────────────────
export const authApi = {
  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    await sleep(600);
    if (!validateEmail(email)) throw new Error('Invalid email address');
    if (password.length < 6) throw new Error('Invalid email or password');
    const isAdmin = email.includes('admin');
    const user: User = {
      id: uid(), name: email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      email, plan: isAdmin ? 'admin' : 'free', role: isAdmin ? 'admin' : 'user',
      joinedAt: new Date().toISOString(), profileCompletion: 40,
    };
    return { user, token: 'mock_' + uid() };
  },
  async register(name: string, email: string, password: string): Promise<{ user: User; token: string }> {
    await sleep(700);
    if (!name.trim()) throw new Error('Name is required');
    if (!validateEmail(email)) throw new Error('Invalid email address');
    if (password.length < 8) throw new Error('Password must be at least 8 characters');
    const user: User = {
      id: uid(), name: name.trim(), email, plan: 'free', role: 'user',
      joinedAt: new Date().toISOString(), profileCompletion: 20,
    };
    return { user, token: 'mock_' + uid() };
  },
};

// ── Jobs ───────────────────────────────────────────────────────────────────
export const jobsApi = {
  async getJobs(filters: SearchFilters = {}): Promise<PaginatedJobs> {
    // Try Supabase first (server-side), fallback to mock data
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams();
        if (filters.q)        params.set('q', filters.q);
        if (filters.category && filters.category !== 'all') params.set('category', filters.category);
        if (filters.type)     params.set('type', filters.type);
        if (filters.level)    params.set('level', filters.level);
        if (filters.sort)     params.set('sort', filters.sort);
        params.set('page',    String(filters.page ?? 1));
        params.set('perPage', String(filters.perPage ?? 12));
        const res = await fetch(`/api/jobs?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.jobs?.length > 0) return data;
        }
      }
    } catch {}

    // Fallback: mock data
    await sleep(200);
    let jobs = [...MOCK_JOBS];
    if (filters.q) {
      const q = filters.q.toLowerCase();
      jobs = jobs.filter(j => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q) || j.skills?.some(s => s.toLowerCase().includes(q)));
    }
    if (filters.category && filters.category !== 'all') jobs = jobs.filter(j => j.category === filters.category);
    if (filters.type)  jobs = jobs.filter(j => j.type === filters.type);
    if (filters.level) jobs = jobs.filter(j => j.level === filters.level);
    if (filters.sort === 'salary') jobs.sort((a, b) => (b.salaryMax ?? 0) - (a.salaryMax ?? 0));
    else { jobs.sort((a, b) => new Date(b.posted).getTime() - new Date(a.posted).getTime()); jobs.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0)); }
    const page = filters.page ?? 1, perPage = filters.perPage ?? 12, total = jobs.length;
    return { jobs: jobs.slice((page - 1) * perPage, page * perPage), total, page, perPage, pages: Math.ceil(total / perPage) };
  },

  async getJob(id: string): Promise<Job | null> {
    try {
      if (typeof window !== 'undefined') {
        const res = await fetch(`/api/jobs?id=${id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.job) return data.job;
        }
      }
    } catch {}
    await sleep(100);
    return MOCK_JOBS.find(j => j.id === id) ?? null;
  },

  async createJob(data: Partial<Job>): Promise<Job> {
    await sleep(400);
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
    const idx = MOCK_JOBS.findIndex(j => j.id === id);
    if (idx >= 0) MOCK_JOBS.splice(idx, 1);
  },

  async updateJob(id: string, data: Partial<Job>): Promise<Job | null> {
    const idx = MOCK_JOBS.findIndex(j => j.id === id);
    if (idx < 0) return null;
    MOCK_JOBS[idx] = { ...MOCK_JOBS[idx], ...data };
    return MOCK_JOBS[idx];
  },
};

// ── Applications ───────────────────────────────────────────────────────────
export const applicationsApi = {
  async apply(jobId: string, cvUrl?: string): Promise<Application> {
    await sleep(500);
    const job = await jobsApi.getJob(jobId);
    if (!job) throw new Error('Job not found');
    return {
      id: uid(), jobId, jobTitle: job.title, company: job.company, companyLogo: job.logo,
      status: 'applied', appliedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      autoApplied: !!cvUrl,
      steps: [
        { label: 'Applied',   done: true,  date: new Date().toISOString() },
        { label: 'Screening', done: false },
        { label: 'Interview', done: false },
        { label: 'Decision',  done: false },
      ],
    };
  },
};

// ── Companies ──────────────────────────────────────────────────────────────
export const companiesApi = {
  async getCompanies(filters: { country?: string; q?: string; category?: string } = {}) {
    await sleep(200);
    let companies = [...MOCK_COMPANIES];
    if (filters.q) { const q = filters.q.toLowerCase(); companies = companies.filter(c => c.name.toLowerCase().includes(q)); }
    return { companies, total: companies.length };
  },
};

// ── Admin ──────────────────────────────────────────────────────────────────
export const adminApi = {
  async getStats(): Promise<AdminStats> {
    await sleep(200);
    return { totalJobs: MOCK_JOBS.length, newToday: 5, activeUsers: 0, subscriptions: 0, sources: 8, revenue: 0 };
  },
};

// ── Subscriptions ─────────────────────────────────────────────────────────
export const subscriptionApi = {
  async createCheckout(plan: string): Promise<{ url?: string; success: boolean }> {
    await sleep(300);
    return { success: true, url: `/pricing` };
  },
};
