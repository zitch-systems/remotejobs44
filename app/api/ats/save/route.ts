// app/api/ats/save/route.ts — Save ATS-fetched jobs to Supabase
// Called by the bulk import UI after jobs are fetched
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import type { Job } from '@/lib/types';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const body = await req.json();
    const jobs: Partial<Job>[] = body.jobs ?? [];

    if (!Array.isArray(jobs) || jobs.length === 0) {
      return NextResponse.json({ error: 'No jobs provided' }, { status: 400 });
    }

    if (jobs.length > 1000) {
      return NextResponse.json({ error: 'Max 1000 jobs per save batch' }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    // Transform camelCase Job to snake_case DB row.
    // Rows without apply_url cannot be deduplicated (the unique index in
    // migration_v2.sql is partial: WHERE apply_url IS NOT NULL), so drop them
    // up front — otherwise repeated bulk imports of the same JS-rendered page
    // would silently pile up duplicates.
    const rows = jobs
      .filter(j => typeof j.applyUrl === 'string' && j.applyUrl.length > 0)
      .map(j => ({
        title:        j.title ?? 'Untitled',
        company:      j.company ?? 'Unknown',
        logo:         j.logo ?? (j.company ? j.company[0] : '?'),
        category:     j.category ?? 'other',
        type:         j.type ?? 'full-time',
        level:        j.level ?? null,
        salary_min:   j.salaryMin ?? null,
        salary_max:   j.salaryMax ?? null,
        currency:     j.currency ?? 'USD',
        location:     j.location ?? 'Worldwide',
        timezone:     j.timezone ?? null,
        description:  j.description ?? '',
        requirements: j.requirements ?? null,
        skills:       j.skills ?? null,
        benefits:     j.benefits ?? null,
        apply_url:    j.applyUrl!,
        apply_email:  j.applyEmail ?? null,
        posted_at:    j.posted ? new Date(j.posted).toISOString() : new Date().toISOString(),
        expires_at:   j.expires ?? null,
        featured:     false,
        is_new:       true,
        is_active:    true,
        source:       j.source ?? 'api',
        source_url:   j.sourceUrl ?? null,
        remote:       j.remote ?? true,
      }));

    const noUrl = jobs.length - rows.length;

    // Upsert against the unique partial index on apply_url so duplicates are
    // skipped per-row instead of failing the whole batch (the prior .insert()
    // would mark all 100 rows skipped on a single 23505 conflict).
    let inserted = 0;
    let skipped  = noUrl;

    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);

      const { data, error } = await supabase
        .from('jobs')
        .upsert(batch, { onConflict: 'apply_url', ignoreDuplicates: true })
        .select('id');

      if (error) {
        console.error('[ats/save] batch error:', error.message);
        skipped += batch.length;
      } else {
        const n = data?.length ?? 0;
        inserted += n;
        skipped  += batch.length - n;
      }
    }

    // Revalidate jobs pages so newly saved jobs appear immediately
    try {
      const { revalidatePath } = await import('next/cache');
      revalidatePath('/jobs');
      revalidatePath('/');
    } catch {}

    return NextResponse.json({
      success: true,
      inserted,
      skipped,
      total: jobs.length,
    });
  } catch (err: any) {
    console.error('[ats/save]', err);
    return NextResponse.json({ error: err.message ?? 'Failed to save jobs' }, { status: 500 });
  }
}
