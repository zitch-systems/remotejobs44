// app/api/ats/save/route.ts — Save ATS-fetched jobs to Supabase
// Called by the bulk import UI after jobs are fetched
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { recordAdminAction } from '@/lib/admin/audit';
import { logError } from '@/lib/log';
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

    // Transform camelCase Job to snake_case DB row. Every fetched job lands
    // as a NEW row — apply_url uniqueness was dropped in migration_v5 at
    // user request, so we no longer dedup at insert time. Same posting
    // fetched via multiple URLs will appear N times in /jobs.
    const rows = jobs.map(j => ({
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
      apply_url:    j.applyUrl ?? null,
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

    // Plain insert — no conflict handling. Each batch of 100 lands as 100
    // new rows regardless of whether any apply_url already exists in DB.
    let inserted = 0;
    let failed   = 0;

    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);

      const { data, error } = await supabase
        .from('jobs')
        .insert(batch)
        .select('id');

      if (error) {
        logError({ event: 'ats.save.batch_failed', error: error.message });
        failed += batch.length;
      } else {
        inserted += data?.length ?? batch.length;
      }
    }

    // Revalidate jobs pages so newly saved jobs appear immediately
    try {
      const { revalidatePath } = await import('next/cache');
      revalidatePath('/jobs');
      revalidatePath('/');
    } catch {}

    // Bulk imports are high-blast-radius admin actions — a compromised
    // admin session could shove thousands of fake jobs into the public
    // feed. The audit row makes it possible to find and roll back via
    // (admin_id, action='ats.bulk_import', created_at). Sample of source
    // names in metadata helps identify which feed got abused without
    // recording every UUID.
    const sampleSources = Array.from(new Set(rows.map(r => r.source ?? 'api'))).slice(0, 10);
    await recordAdminAction({
      adminId: auth.adminId, adminEmail: auth.adminEmail,
      action: 'ats.bulk_import', targetType: null, targetId: null,
      metadata: { inserted, failed, total: jobs.length, sample_sources: sampleSources },
    });

    return NextResponse.json({
      success: true,
      inserted,
      // `skipped` is kept in the response shape for backward compatibility
      // with the frontend that displays "X saved · Y skipped". With dedup
      // disabled, "skipped" now only counts rows that failed to insert
      // (DB error, bad shape) — duplicates no longer skip.
      skipped: failed,
      total: jobs.length,
    });
  } catch (err: any) {
    logError({ event: 'ats.save.unhandled', error: err?.message ?? String(err) });
    return NextResponse.json({ error: err.message ?? 'Failed to save jobs' }, { status: 500 });
  }
}
