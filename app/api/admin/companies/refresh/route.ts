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
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import { isHardcodedAdmin } from '@/lib/admin-emails';
import { detectATSFromUrl, type ATSPlatform } from '@/lib/ats-detect';
import { fetchATSJobs } from '@/lib/ats-engine';
import { recordAdminAction } from '@/lib/admin/audit';

async function requireAdmin(): Promise<{ ok: true; adminId: string; adminEmail: string | null } | { ok: false }> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isAdmin = profile?.role === 'admin' || isHardcodedAdmin(user.email);
  if (!isAdmin) return { ok: false };
  return { ok: true, adminId: user.id, adminEmail: user.email ?? null };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { company?: string; platform?: ATSPlatform; slug?: string; apply_url_sample?: string } = {};
  try { body = await req.json(); } catch {}

  const company = (body.company ?? '').trim();
  if (!company) return NextResponse.json({ error: 'company is required' }, { status: 400 });

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

  // ── 1. Pull fresh jobs from the ATS ───────────────────────────────────
  const fetched = await fetchATSJobs(platform, slug, '');
  if (fetched.error) {
    return NextResponse.json({ error: `ATS fetch failed: ${fetched.error}` }, { status: 502 });
  }

  // Keep only rows we can dedupe on (apply_url). Without it the unique
  // partial index can't catch dupes and we'd silently double-insert.
  const fetchedJobs = fetched.jobs.filter(j => typeof j.applyUrl === 'string' && j.applyUrl!.length > 0);
  const fetchedUrls = new Set(fetchedJobs.map(j => j.applyUrl!));

  // ── 2. Read what we currently have for this company ──────────────────
  const admin = createAdminSupabaseClient();
  const { data: existing, error: readErr } = await admin
    .from('jobs')
    .select('id,apply_url,is_active')
    .ilike('company', company)   // case-insensitive — handles "Stripe" vs "stripe"
    .not('apply_url', 'is', null);
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

  const existingByUrl = new Map<string, { id: string; is_active: boolean }>();
  for (const row of (existing ?? [])) {
    if (row.apply_url) existingByUrl.set(row.apply_url, { id: row.id, is_active: row.is_active });
  }

  // ── 3. Inactive: rows in DB but not in the new fetch ─────────────────
  const toExpire: string[] = [];
  for (const [url, row] of existingByUrl) {
    if (row.is_active && !fetchedUrls.has(url)) toExpire.push(row.id);
  }
  let removed = 0;
  if (toExpire.length > 0) {
    const { error: expErr, count } = await admin
      .from('jobs')
      .update({ is_active: false, updated_at: new Date().toISOString() }, { count: 'exact' })
      .in('id', toExpire);
    if (expErr) console.error('[companies/refresh] expire failed:', expErr.message);
    removed = count ?? toExpire.length;
  }

  // ── 4. Insert: rows in the new fetch but not in DB ───────────────────
  // For URLs we already have but are inactive, flip them back to active.
  const toReactivate: string[] = [];
  const toInsert: Array<Record<string, any>> = [];
  for (const j of fetchedJobs) {
    const url = j.applyUrl!;
    const existingRow = existingByUrl.get(url);
    if (existingRow) {
      if (!existingRow.is_active) toReactivate.push(existingRow.id);
    } else {
      toInsert.push({
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
        apply_url:    url,
        apply_email:  j.applyEmail ?? null,
        posted_at:    j.posted ? new Date(j.posted).toISOString() : new Date().toISOString(),
        expires_at:   j.expires ?? null,
        featured:     false,
        is_new:       true,
        is_active:    true,
        source:       j.source ?? platform,
        source_url:   j.sourceUrl ?? null,
        remote:       j.remote ?? true,
      });
    }
  }

  let reactivated = 0;
  if (toReactivate.length > 0) {
    const { error: reErr, count } = await admin
      .from('jobs')
      .update({ is_active: true, updated_at: new Date().toISOString() }, { count: 'exact' })
      .in('id', toReactivate);
    if (reErr) console.error('[companies/refresh] reactivate failed:', reErr.message);
    reactivated = count ?? toReactivate.length;
  }

  let added = 0;
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100);
    const { data, error: insErr } = await admin
      .from('jobs')
      .upsert(batch, { onConflict: 'apply_url', ignoreDuplicates: true })
      .select('id');
    if (insErr) {
      console.error('[companies/refresh] insert batch failed:', insErr.message);
      continue;
    }
    added += data?.length ?? 0;
  }

  // ── 5. Revalidate the public jobs pages so users see the changes ─────
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
    removed,        // newly marked inactive
    reactivated,    // were inactive, now active again
    kept:           fetchedUrls.size - added - reactivated,
    total_fetched:  fetched.total,
  };

  await recordAdminAction({
    adminId: auth.adminId, adminEmail: auth.adminEmail,
    action: 'company.refresh', targetType: 'company', targetId: company,
    metadata: result,
  });

  return NextResponse.json(result);
}
