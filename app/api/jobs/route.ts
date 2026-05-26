// app/api/jobs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { MOCK_JOBS } from '@/lib/mock-data';
import { isHardcodedAdmin } from '@/lib/admin-emails';

export const revalidate = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id       = searchParams.get('id');
  const q        = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const type     = searchParams.get('type') ?? '';
  const level    = searchParams.get('level') ?? '';
  const region   = searchParams.get('region') ?? '';
  const country  = searchParams.get('country') ?? '';
  // remote=true (string from URL) → filter to remote-only roles.
  // Anything else (including unset) means "don't filter on remote".
  const remote   = searchParams.get('remote') === 'true';
  // Advanced filters — previously parsed by the page but never sent.
  const salary   = searchParams.get('salary') ?? '';
  const timezone = searchParams.get('timezone') ?? '';
  const posted   = searchParams.get('posted') ?? '';
  const sort     = searchParams.get('sort') ?? 'newest';
  const page     = parseInt(searchParams.get('page') ?? '1');
  const perPage  = parseInt(searchParams.get('perPage') ?? '12');

  const REGION_TERMS: Record<string, string[]> = {
    africa:        ['africa','nigeria','ghana','kenya','south africa','egypt','ethiopia','cameroon','senegal'],
    nigeria:       ['nigeria','lagos','abuja','port harcourt'],
    ghana:         ['ghana','accra'],
    kenya:         ['kenya','nairobi'],
    'south-africa':['south africa','johannesburg','cape town','durban'],
    europe:        ['europe','uk','germany','france','netherlands','spain','italy','sweden','poland'],
    uk:            ['uk','united kingdom','london','england','scotland','wales'],
    us:            ['us','usa','united states','new york','san francisco','los angeles','chicago'],
    canada:        ['canada','toronto','vancouver','montreal'],
    latam:         ['latin america','brazil','mexico','colombia','argentina','chile'],
    asia:          ['asia','india','singapore','japan','china','korea','indonesia','vietnam'],
    worldwide:     ['worldwide','global','remote','anywhere'],
  };

  try {
    const supabase = createAdminSupabaseClient();

    if (id) {
      const { data: job } = await supabase.from('jobs').select('*').eq('id', id).eq('is_active', true).single();
      if (job) return NextResponse.json({ job: transformJob(job) });
      const mock = MOCK_JOBS.find(j => j.id === id);
      return NextResponse.json({ job: mock ?? null });
    }

    let query = supabase.from('jobs').select('*', { count: 'exact' }).eq('is_active', true);
    if (q) {
      // Strip characters that have meaning in a PostgREST or() filter list:
      // commas separate clauses, parentheses group, % and * are ilike wildcards,
      // backslash is the escape character. Quotes (",') are also stripped to
      // avoid breaking out of the filter string literal.
      const safe = q.replace(/[,()%*\\"']/g, ' ').trim().slice(0, 100);
      if (safe) query = query.or(`title.ilike.%${safe}%,company.ilike.%${safe}%,description.ilike.%${safe}%`);
    }
    if (category) query = query.eq('category', category);
    if (type)     query = query.eq('type', type);
    if (level)    query = query.eq('level', level);
    if (remote) {
      // The `remote` boolean column was set during ingestion by checking
      // /remote/i.test(location), which misses real remote roles whose
      // locations say "Worldwide", "Anywhere", "Global", "Distributed",
      // "WFH" or "London (Remote)". Without this OR-clause the filter
      // drops ~90% of legitimately remote postings — the exact symptom
      // a 32k-import → 3k-visible looks like.
      query = query.or([
        'remote.eq.true',
        'location.ilike.%remote%',
        'location.ilike.%worldwide%',
        'location.ilike.%anywhere%',
        'location.ilike.%global%',
        'location.ilike.%distributed%',
        'location.ilike.%wfh%',
      ].join(','));
    }
    // Country takes priority over region (more specific). Both fall through
    // to a location ILIKE substring match if not in the REGION_TERMS map.
    const locFilter = country || region;
    if (locFilter && REGION_TERMS[locFilter]) {
      const orTerms = REGION_TERMS[locFilter].map(t => `location.ilike.%${t}%`).join(',');
      query = query.or(orTerms);
    } else if (locFilter) {
      // Escape % and _ wildcards to prevent unintended broad matches.
      const safe = locFilter.replace(/[\\%_]/g, '\\$&').slice(0, 100);
      query = query.ilike('location', `%${safe}%`);
    }
    // Salary range key like "60-100" → salary_max between 60k–100k USD.
    // Empty string is "any salary" — skip.
    if (salary && /^\d+-\d+$/.test(salary)) {
      const [lo, hi] = salary.split('-').map(n => parseInt(n, 10) * 1000);
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        query = query.gte('salary_max', lo).lte('salary_max', hi);
      }
    }
    if (timezone) {
      const safeTz = timezone.replace(/[\\%_]/g, '\\$&').slice(0, 50);
      query = query.ilike('timezone', `%${safeTz}%`);
    }
    if (posted && /^\d+$/.test(posted)) {
      const days = parseInt(posted, 10);
      if (days > 0 && days <= 365) {
        const since = new Date(Date.now() - days * 86_400_000).toISOString();
        query = query.gte('posted_at', since);
      }
    }
    if (sort === 'salary') query = query.order('salary_max', { ascending: false, nullsFirst: false });
    else query = query.order('featured', { ascending: false }).order('posted_at', { ascending: false });

    const from = (page - 1) * perPage;
    query = query.range(from, from + perPage - 1);

    const { data: jobs, count, error } = await query;
    if (error || !jobs) throw new Error(error?.message ?? 'Query failed');

    if (jobs.length > 0) {
      return NextResponse.json({
        jobs: jobs.map(transformJob),
        total: count ?? 0,
        page, perPage,
        pages: Math.ceil((count ?? 0) / perPage),
      });
    }

    return NextResponse.json({ jobs: [], total: 0, page, perPage, pages: 0 });
  } catch {
    return NextResponse.json({ jobs: [], total: 0, page, perPage, pages: 0 });
  }
}

async function requireAdmin(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin' && !isHardcodedAdmin(user.email)) {
      return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    return { ok: true };
  } catch {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
}

const VALID_CATEGORIES = ['engineering','design','marketing','finance','sales','data','hr','product','legal','operations','other'];
const VALID_TYPES      = ['full-time','part-time','contract','freelance','internship'];
const VALID_LEVELS     = ['entry','mid','senior','lead','executive'];

function validateJobBody(body: any): string | null {
  if (!body.title?.trim())   return 'title is required';
  if (!body.company?.trim()) return 'company is required';
  if (String(body.title).length   > 200)    return 'title too long (max 200)';
  if (String(body.company).length > 200)    return 'company name too long (max 200)';
  if (body.description && String(body.description).length > 10000) return 'description too long (max 10000)';
  if (body.requirements && String(body.requirements).length > 5000) return 'requirements too long (max 5000)';
  if (body.benefits     && String(body.benefits).length     > 3000) return 'benefits too long (max 3000)';
  if (body.location     && String(body.location).length     > 200)  return 'location too long (max 200)';
  if (body.category && !VALID_CATEGORIES.includes(body.category)) return 'invalid category';
  if (body.type     && !VALID_TYPES.includes(body.type))           return 'invalid type';
  if (body.level    && !VALID_LEVELS.includes(body.level))         return 'invalid level';
  if (body.salaryMin !== undefined && body.salaryMin !== null) {
    const n = Number(body.salaryMin);
    if (isNaN(n) || n < 0) return 'salaryMin must be a non-negative number';
  }
  if (body.salaryMax !== undefined && body.salaryMax !== null) {
    const n = Number(body.salaryMax);
    if (isNaN(n) || n < 0) return 'salaryMax must be a non-negative number';
  }
  if (body.applyUrl && !/^https?:\/\/.+/.test(body.applyUrl)) return 'applyUrl must be a valid URL';
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const body = await req.json();
    const validationError = validateJobBody(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const supabase = createAdminSupabaseClient();
    const row = {
      title:       body.title,
      company:     body.company,
      company_id:  body.companyId ?? null,
      logo:        body.logo ?? null,
      category:    body.category ?? 'other',
      type:        body.type ?? 'full-time',
      level:       body.level ?? null,
      salary_min:  body.salaryMin ?? null,
      salary_max:  body.salaryMax ?? null,
      currency:    body.currency ?? 'USD',
      location:    body.location ?? 'Worldwide',
      timezone:    body.timezone ?? null,
      description: body.description ?? '',
      requirements:body.requirements ?? null,
      skills:      body.skills ?? null,
      benefits:    body.benefits ?? null,
      apply_url:   body.applyUrl ?? null,
      apply_email: body.applyEmail ?? null,
      posted_at:   body.posted ?? new Date().toISOString(),
      expires_at:  body.expires ?? null,
      featured:    body.featured ?? false,
      is_new:      true,
      source:      body.source ?? 'manual',
      source_url:  body.sourceUrl ?? null,
      remote:      body.remote ?? true,
      is_active:   true,
    };

    const { data: job, error } = await supabase.from('jobs').insert(row).select().single();
    if (error) throw new Error('insert_failed');
    return NextResponse.json({ job: transformJob(job) }, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/jobs]', err);
    return NextResponse.json({ error: 'Failed to create job. Please try again.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing job id' }, { status: 400 });

  try {
    const body = await req.json();
    const supabase = createAdminSupabaseClient();

    const updates: Record<string, unknown> = {};
    if (body.title       !== undefined) updates.title        = body.title;
    if (body.company     !== undefined) updates.company      = body.company;
    if (body.logo        !== undefined) updates.logo         = body.logo;
    if (body.category    !== undefined) updates.category     = body.category;
    if (body.type        !== undefined) updates.type         = body.type;
    if (body.level       !== undefined) updates.level        = body.level;
    if (body.salaryMin   !== undefined) updates.salary_min   = body.salaryMin;
    if (body.salaryMax   !== undefined) updates.salary_max   = body.salaryMax;
    if (body.currency    !== undefined) updates.currency     = body.currency;
    if (body.location    !== undefined) updates.location     = body.location;
    if (body.timezone    !== undefined) updates.timezone     = body.timezone;
    if (body.description !== undefined) updates.description  = body.description;
    if (body.requirements!== undefined) updates.requirements = body.requirements;
    if (body.skills      !== undefined) updates.skills       = body.skills;
    if (body.benefits    !== undefined) updates.benefits     = body.benefits;
    if (body.applyUrl    !== undefined) updates.apply_url    = body.applyUrl;
    if (body.applyEmail  !== undefined) updates.apply_email  = body.applyEmail;
    if (body.featured    !== undefined) updates.featured     = body.featured;
    if (body.isActive    !== undefined) updates.is_active    = body.isActive;
    if (body.expires     !== undefined) updates.expires_at   = body.expires;

    const { data: job, error } = await supabase.from('jobs').update(updates).eq('id', id).select().single();
    if (error) throw new Error('update_failed');
    return NextResponse.json({ job: transformJob(job) });
  } catch (err: any) {
    console.error('[PATCH /api/jobs]', err);
    return NextResponse.json({ error: 'Failed to update job. Please try again.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing job id' }, { status: 400 });

  try {
    const supabase = createAdminSupabaseClient();
    const { error } = await supabase.from('jobs').delete().eq('id', id);
    if (error) throw new Error('delete_failed');
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[DELETE /api/jobs]', err);
    return NextResponse.json({ error: 'Failed to delete job. Please try again.' }, { status: 500 });
  }
}

function transformJob(j: any) {
  return {
    id:           j.id,
    title:        j.title,
    company:      j.company,
    companyId:    j.company_id ?? null,
    logo:         j.logo ?? (j.company?.[0]?.toUpperCase() ?? '?'),
    category:     j.category ?? 'other',
    type:         j.type ?? 'full-time',
    level:        j.level ?? 'mid',
    salaryMin:    j.salary_min ?? null,
    salaryMax:    j.salary_max ?? null,
    currency:     j.currency ?? 'USD',
    location:     j.location ?? 'Worldwide',
    timezone:     j.timezone ?? null,
    description:  j.description ?? '',
    requirements: j.requirements ?? null,
    skills:       j.skills ?? [],
    benefits:     j.benefits ?? null,
    applyUrl:     j.apply_url ?? null,
    applyEmail:   j.apply_email ?? null,
    postedAt:     j.posted_at ?? j.created_at,
    expiresAt:    j.expires_at ?? null,
    featured:     j.featured ?? false,
    isNew:        j.is_new ?? false,
    source:       j.source ?? 'manual',
    sourceUrl:    j.source_url ?? null,
    remote:       j.remote ?? true,
    isActive:     j.is_active ?? true,
  };
}
