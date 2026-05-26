// app/api/admin/companies/refresh/route.ts
// Re-scrape a single company's ATS and reconcile against the jobs table:
//   - vacancies still listed     → kept (no DB write)
//   - new vacancies in the feed  → INSERT (active)
//   - vacancies in DB but not in the feed → mark is_active = false
//
// "Mark inactive" instead of DELETE so we keep an application-history trail
// for users who applied — saved_jobs / applications FK back to the row, and
// blowing them away would corrupt their dashboards.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { detectATSFromUrl, type ATSPlatform } from '@/lib/ats-detect';
import { fetchATSJobs } from '@/lib/ats-engine';
import { recordAdminAction } from '@/lib/admin/audit';
import { requireAdmin } from '@/lib/admin/auth';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  let body: { company?: string; platform?: ATSPlatform; slug?: string; apply_url_sample?: string } = {};
  try { body = await req.json(); } catch {}

  const company = (body.company ?? '').trim();
  if (!company) return NextResponse.json({ error: 'company is required' }, { status: 400 });
  if (!/[a-z0-9]/i.test(company)) {
    return NextResponse.json({ error: 'company must contain at least one alphanumeric character' }, { status: 400 });
  }

  // Two ways to identify the source: explicit platform+slug (preferred), or
  // re-detect from an example apply_url. Callers from the admin UI send
  // platform+slug; the apply_url fallback is for ad-hoc tooling.
  let platform: ATSPlatform | undefined = body.platform;
  let slug: string | undefined = body.slug;
  if ((!platform || !slug) && body.apply_url_sample) {
    const detected = detectATSFromUrl(body.apply_url_sample);
    if (detected) {
      platform = detected.platform;
      slug     = detected.slug;
    }
  }
  if (!platform || !slug) {
    return NextResponse.json({
      error: 'Could not determine ATS — pass platform+slug or a representative apply_url_sample',
    }, { status: 400 });
  }
  // Slug becomes part of an outbound URL fetched by fetchATSJobs. Constrain
  // it to safe filename-ish characters so an admin (or compromised admin
  // session) can't pass `..` segments or other path-traversal payloads.
  if (!/^[a-z0-9._-]{1,80}$/i.test(slug)) {
    return NextResponse.json({ error: 'Invalid slug — must be 1-80 chars [a-z0-9._-]' }, { status: 400 });
  }

  // ── 1. Pull fresh jobs from the ATS ───────────────────────────────────
  const fetched = await fetchATSJobs(platform, slug, '');
  if (fetched.error) {
    return NextResponse.json({ error: `ATS fetch failed: ${fetched.error}` }, { status: 502 });
  }

  // Dedup-by-apply_url was disabled at user request (migration_v5). With
  // no unique key, the previous "compare apply_url sets to find expired /
  // reactivate / insert-new" reconciliation breaks: a fetched apply_url
  // can match N existing rows, and "kept" / "removed" are no longer
  // meaningful concepts. Simplified to: always insert every fetched row.
  // To purge stale rows, the admin can use the existing Remove Company
  // button on /admin/companies.
  const fetchedJobs = fetched.jobs;
  const admin = createAdminSupabaseClient();

  const toInsert: Array<Record<string, any>> = fetchedJobs.map(j => ({
    title:        j.title ?? 'Untitled',
    company:      j.company ?? company,
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
    source:       j.source ?? platform,
    source_url:   j.sourceUrl ?? null,
    remote:       j.remote ?? true,
  }));

  let added = 0;
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100);
    const { data, error: insErr } = await admin
      .from('jobs')
      .insert(batch)
      .select('id');
    if (insErr) {
      console.error('[companies/refresh] insert batch failed:', insErr.message);
      continue;
    }
    added += data?.length ?? batch.length;
  }

  // No expire / reactivate phases anymore — they relied on apply_url
  // identity which is no longer unique.
  const removed = 0;
  const reactivated = 0;

  // ── Revalidate the public jobs pages so users see the changes ───────
  try {
    const { revalidatePath } = await import('next/cache');
    revalidatePath('/jobs');
    revalidatePath('/');
  } catch {}

  const result = {
    success: true,
    company,
    platform,
    slug,
    added,
    removed,        // always 0 now — see note above
    reactivated,    // always 0 now — see note above
    kept:           0,
    total_fetched:  fetched.total,
  };

  await recordAdminAction({
    adminId: auth.adminId, adminEmail: auth.adminEmail,
    action: 'company.refresh', targetType: 'company', targetId: company,
    metadata: result,
  });

  return NextResponse.json(result);
}
