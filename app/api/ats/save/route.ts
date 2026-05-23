// app/api/ats/save/route.ts — Save ATS-fetched jobs to Supabase
// Called by the bulk import UI after jobs are fetched
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import type { Job } from '@/lib/types';

async function requireAdmin(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const ADMIN_EMAILS = ['admin@remotejobs44.com', 'admin@remotejobs4.com', 'zitchinfo@gmail.com'];
    if (profile?.role !== 'admin' && !ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? '')) {
      return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    return { ok: true };
  } catch {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
}

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

    // Transform camelCase Job to snake_case DB row
    const rows = jobs.map(j => ({
      // Use ATS-specific ID as external reference, generate UUID for PK
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

    // Upsert — skip duplicates based on title+company+apply_url
    // We insert in batches of 100 to avoid payload limits
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);

      const { data, error } = await supabase
        .from('jobs')
        .insert(batch)
        .select('id');

      if (error) {
        // Duplicate key errors are expected — count skips
        if (error.code === '23505') {
          skipped += batch.length;
        } else {
          console.error('[ats/save] batch error:', error.message);
          skipped += batch.length;
        }
      } else {
        inserted += data?.length ?? 0;
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
    console.error('[ats/save]'