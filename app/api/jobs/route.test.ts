import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeSupabaseMock, type QueryResolver } from '@/lib/test/supabase-mock';

let resolver: QueryResolver;
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({}),
  createAdminSupabaseClient: () => makeSupabaseMock(ctx => resolver(ctx)),
}));
vi.mock('@/lib/auth/requester-plan', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/auth/requester-plan')>(),
  getRequesterPlan: async () => 'anon',
}));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ success: true }), getIP: () => 'test' }));
vi.mock('@/lib/admin/auth', () => ({ requireAdmin: async () => ({ ok: false }) }));
vi.mock('@/lib/admin/audit', () => ({ recordAdminAction: async () => {} }));
vi.mock('@/lib/log', () => ({ logError: () => {}, logWarn: () => {} }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { GET } = await import('./route');
const id = '12345678-1234-4234-8234-123456789abc';
beforeEach(() => { resolver = () => ({ data: null }); });

describe('job lookup response boundaries', () => {
  it.each([`id=${id}`, `ids=${id}`])('reports a database outage for %s without leaking details', async query => {
    resolver = () => ({ error: { message: 'database connection detail' } });
    const response = await GET(new NextRequest(`https://example.test/api/jobs?${query}`));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('database connection detail');
  });

  it('keeps a clean missing job distinct from an outage', async () => {
    const response = await GET(new NextRequest(`https://example.test/api/jobs?id=${id}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ job: null });
  });

  it('masks employer identity and paid channels on an anonymous lookup', async () => {
    resolver = () => ({ data: { id, title: 'Engineer at Example Co', company: 'Example Co', logo: 'https://example.test/logo.png', description: 'Work at Example Co', apply_url: 'https://example.test/apply', is_active: true } });
    const response = await GET(new NextRequest(`https://example.test/api/jobs?id=${id}`));
    const { job } = await response.json();
    expect(job.company).toBe('Hidden Company');
    expect(job.title).not.toContain('Example Co');
    expect(job.logo).not.toContain('https://');
    expect(job.applyUrl).toBeFalsy();
  });
});
