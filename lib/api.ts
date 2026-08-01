// lib/api.ts — Hybrid API: Supabase when available, mock data as fallback
import type { Job, Application, SearchFilters, PaginatedJobs, AdminStats } from './types';
import { MOCK_JOBS } from './mock-data';
import { sleep } from './utils';

// Auth is handled directly by the Supabase client in the /login and
// /register pages (see app/register/page.tsx). The old mock `authApi`
// object lived here but had no callers and carried a stale, divergent
// length-only password policy — a drift trap now that the real rules
// live in lib/auth/password.ts — so it was removed.

// ── Jobs ───────────────────────────────────────────────────────────────────
export const jobsApi = {
  async getJobs(filters: SearchFilters = {}): Promise<PaginatedJobs> {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams();
      if (filters.q)        params.set('q', filters.q);
      if (filters.category && filters.category !== 'all') params.set('category', filters.category);
      if (filters.type)     params.set('type', filters.type);
      if (filters.level)    params.set('level', filters.level);
      if (filters.sort)     params.set('sort', filters.sort);
      if (filters.region)      params.set('region', filters.region);
      if (filters.country)     params.set('country', filters.country);
      if (filters.remote)      params.set('remote', 'true');
      // Advanced filters — see /api/jobs route for how each is applied.
      if (filters.salary)      params.set('salary', filters.salary);
      if (filters.timezone)    params.set('timezone', filters.timezone);
      if (filters.posted)      params.set('posted', filters.posted);
      params.set('page',    String(filters.page ?? 1));
      params.set('perPage', String(filters.perPage ?? 12));
      try {
        const res = await fetch(`/api/jobs?${params.toString()}`);
        if (res.ok) {
          // Trust the API — an empty jobs array is a real "no results"
          // signal (admin filtered down, niche search). The earlier
          // implementation only returned when `data.jobs?.length > 0`
          // and otherwise fell through to MOCK_JOBS, which made the
          // admin /admin/jobs page render fake postings when a search
          // matched zero real rows.
          return await res.json();
        }
      } catch {}
    }

    // Fallback: mock data — only fires on actual network/HTTP failure
    // (or during true SSR where window is undefined). Useful for dev
    // when the DB is empty; in production the try{} above runs.
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
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch(`/api/jobs?id=${id}`);
        if (res.ok) {
          const data = await res.json();
          // Trust the API — `data.job === null` is a real "not found"
          // signal we should surface as null. The previous version fell
          // through to MOCK_JOBS.find() for an unknown id, which could
          // serve a dev fixture for an admin-deleted real row.
          return data.job ?? null;
        }
      } catch {}
    }
    await sleep(100);
    return MOCK_JOBS.find(j => j.id === id) ?? null;
  },

  async createJob(data: Partial<Job>): Promise<Job> {
    if (typeof window !== 'undefined') {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (res.ok && result.job) return result.job;
      throw new Error(result.error ?? 'Failed to create job');
    }
    // SSR fallback (should not normally reach here)
    throw new Error('createJob must be called client-side');
  },

  async deleteJob(id: string): Promise<void> {
    if (typeof window !== 'undefined') {
      const res = await fetch(`/api/jobs?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const result = await res.json().catch(() => ({ error: 'Failed to delete job' }));
        throw new Error(result.error ?? 'Failed to delete job');
      }
      return;
    }
    throw new Error('deleteJob must be called client-side');
  },

  async updateJob(id: string, data: Partial<Job>): Promise<Job | null> {
    if (typeof window !== 'undefined') {
      const res = await fetch(`/api/jobs?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (res.ok) return result.job ?? null;
      throw new Error(result.error ?? 'Failed to update job');
    }
    throw new Error('updateJob must be called client-side');
  },
};

// ── Applications ───────────────────────────────────────────────────────────
export const applicationsApi = {
  async apply(jobId: string, cvUrl?: string): Promise<Application & { applyUrl?: string; applyEmail?: string }> {
    if (typeof window !== 'undefined') {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, autoApplied: !!cvUrl }),
      });
      const data = await res.json();
      if (res.ok && data.application) return data.application;
      throw new Error(data.error ?? 'Failed to apply');
    }
    throw new Error('apply must be called client-side');
  },

  async getChannel(jobId: string): Promise<{ applyUrl?: string; applyEmail?: string }> {
    if (typeof window !== 'undefined') {
      const res = await fetch(`/api/applications?channel=${encodeURIComponent(jobId)}`);
      const data = await res.json();
      if (res.ok) {
        return {
          applyUrl: data.applyUrl ?? undefined,
          applyEmail: data.applyEmail ?? undefined,
        };
      }
      throw new Error(data.error ?? 'Failed to load application link');
    }
    throw new Error('getChannel must be called client-side');
  },
};

// companiesApi removed — no callers. The /companies page reads
// /api/companies directly via fetch, and /companies/[slug] does its
// own server-side aggregation. The mock-only stub here was dead code
// dating to before the real API existed.

// ── Admin ──────────────────────────────────────────────────────────────────
export const adminApi = {
  async getStats(): Promise<AdminStats> {
    try {
      if (typeof window !== 'undefined') {
        const res = await fetch('/api/admin/stats');
        if (res.ok) {
          const data = await res.json();
          return data;
        }
      }
    } catch {}
    // Fallback
    return { totalJobs: MOCK_JOBS.length, newToday: 0, activeUsers: 0, subscriptions: 0, sources: 0, revenue: 0 };
  },
};

// ── Subscriptions ─────────────────────────────────────────────────────────
export const subscriptionApi = {
  async createCheckout(plan: string): Promise<{ url?: string; success: boolean }> {
    await sleep(300);
    return { success: true, url: `/pricing` };
  },
};
