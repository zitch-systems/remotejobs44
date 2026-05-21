// app/api/jobs/route.ts — Supabase-backed jobs API
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { MOCK_JOBS } from '@/lib/mock-data';

export const revalidate = 60; // cache for 60s

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id      = searchParams.get('id');
  const q       = searchParams.get('q') ?? '';
  const category= searchParams.get('category') ?? '';
  const type    = searchParams.get('type') ?? '';
  const level   = searchParams.get('level') ?? '';
  const sort    = searchParams.get('sort') ?? 'newest';
  const page    = parseInt(searchParams.get('page') ?? '1');
  const perPage = parseInt(searchParams.get('perPage') ?? '12');

  try {
    const supabase = createAdminSupabaseClient();

    // Single job lookup
    if (id) {
      const { data: job } = await supabase.from('jobs').select('*').eq('id', id).eq('is_active', true).single();
      if (job) return NextResponse.json({ job: transformJob(job) });
      // Fallback to mock
      const mock = MOCK_JOBS.find(j => j.id === id);
      return NextResponse.json({ job: mock ?? null });
    }

    // Build query
    let query = supabase.from('jobs').select('*', { count: 'exact' }).eq('is_active', true);
    if (q)        query = query.or(`title.ilike.%${q}%,company.ilike.%${q}%,description.ilike.%${q}%`);
    if (category) query = query.eq('category', category);
    if (type)     query = query.eq('type', type);
    if (level)    query = query.eq('level', level);
    if (sort === 'salary') query = query.order('salary_max', { ascending: false, nullsFirst: false });
    else query = query.order('featured', { ascending: false }).order('posted_at', { ascending: false });

    const from = (page - 1) * perPage;
    query = query.range(from, from + perPage - 1);

    const { data: jobs, count, error } = await query;

    if (error || !jobs) throw new Error(error?.message ?? 'Query failed');

    // If Supabase has jobs, return them
    if (jobs.length > 0) {
      return NextResponse.json({
        jobs: jobs.map(transformJob),
        total: count ?? 0,
        page, perPage,
        pages: Math.ceil((count ?? 0) / perPage),
      });
    }

    // Supabase is empty — return mock data so site isn't blank
    return NextResponse.json({ jobs: [], total: 0, page, perPage, pages: 0 });

  } catch {
    // Supabase not configured or error — return empty (client will use mock fallback)
    return NextResponse.json({ jobs: [], total: 0, page, perPage, pages: 0 });
  }
}

// Transform Supabase snake_case to our camelCase Job type
function transformJob(row: Record<string, unknown>) {
  return {
    id:          row.id,
    title:       row.title,
    company:     row.company,
    companyId:   row.company_id,
    logo:        row.logo,
    category:    row.category,
    type:        row.type,
    level:       row.level,
    salaryMin:   row.salary_min,
    salaryMax:   row.salary_max,
    currency:    row.currency ?? 'USD',
    location:    row.location,
    timezone:    row.timezone,
    description: row.description,
    requirements:row.requirements,
    skills:      row.skills,
    benefits:    row.benefits,
    applyUrl:    row.apply_url,
    applyEmail:  row.apply_email,
    posted:      row.posted_at,
    expires:     row.expires_at,
    featured:    row.featured ?? false,
    isNew:       row.is_new ?? false,
    source:      row.source ?? 'manual',
    sourceUrl:   row.source_url,
    views:       row.views ?? 0,
    applications:row.applications ?? 0,
    remote:      row.remote ?? true,
  };
}
