// app/api/jobs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { notExpired as visibilityNotExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { MOCK_JOBS } from '@/lib/mock-data';
import { rateLimit, getIP } from '@/lib/rate-limit';
import { getRequesterPlan, canSeePaidFields, SAFE_JOB_COLUMNS } from '@/lib/auth/requester-plan';
import { REGION_TERMS } from '@/lib/jobs/region-terms';
import { requireAdmin } from '@/lib/admin/auth';
import { recordAdminAction } from '@/lib/admin/audit';
import { logError, logWarn } from '@/lib/log';

// /jobs (60s revalidate) and /jobs/[id] (300s revalidate) cache server-
// rendered HTML at the edge. Without a manual flush, an admin's create /
// edit / delete only surfaces to the public after the TTL expires —
// long enough that admins repeatedly re-fetch wondering whether the
// save worked. Calling revalidatePath here drops the affected entries
// from the cache so the very next public request rebuilds with the
// fresh row. Wrapped in try/catch because revalidatePath can throw at
// edges (during build, in a worker without an HTTP context) and we'd
// rather a successful DB write return 200 than fail because the cache
// flush couldn't reach the dispatcher.
function safeRevalidate(...paths: string[]): void {
  for (const p of paths) {
    try { revalidatePath(p); }
    catch (err: any) { logWarn({ event: 'jobs.revalidate_failed', path: p, error: err?.message ?? String(err) }); }
  }
  // The listing + detail DATA now live in the tagged data cache
  // (unstable_cache in app/jobs/page.tsx and lib/jobs/job-detail.ts), which
  // revalidatePath doesn't touch — both routes render dynamically and pull
  // from that cache. The bulk 'jobs' tag covers every cached listing
  // variant and every cached detail row in one flush. ('max' is Next 16's
  // spelling of the classic single-arg revalidateTag semantics.)
  try { revalidateTag('jobs', 'max'); }
  catch (err: any) { logWarn({ event: 'jobs.revalidate_tag_failed', error: err?.message ?? String(err) }); }
}

// MOCK_JOBS is a development fallback used by single-job lookups when the
// requested id isn't in the DB. In production an unknown id should resolve
// to "not found" instead of leaking a mock posting (the Vercel demo job
// at id='j1' showing up on prod was the original reason for this guard).
const ALLOW_MOCKS = process.env.NODE_ENV !== 'production';

// jobs.id is a uuid column — anything else PostgREST would 22P02
// ("invalid input syntax for type uuid"), which previously bubbled up
// through the catch and surfaced as a 500. Spamming `?id=bogus` was
// enough to fill the error log with noise. Validate the shape here so
// the route degrades to a graceful "not found".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const revalidate = 60;
// Cold-start + count(*) over 64k rows with OR-IS-NULL filters Seq Scans
// for ~4 s; vercel.json's path-match maxDuration isn't applying reliably
// on this route. The per-route export is Next's preferred path and
// gives us 30 s of budget for cold-lambda + count + select.
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  // Per-IP rate-limit to slow bulk-scraping of the public jobs feed.
  // 120/minute is well above any human-driven page interaction
  // (real users hit this on filter changes — at most a few per minute)
  // but well below what a scraper trying to mirror the DB would need.
  // Defense-in-depth only — direct Supabase REST with the anon key is
  // still open by RLS design; this just keeps Next.js from being the
  // easy path. Same in-memory store as the contact form rate limit.
  const ip = getIP(req);
  const rl = rateLimit(`jobs:${ip}`, 120, 60_000);
  if (!rl.success) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: 'Too many requests. Slow down.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const { searchParams } = req.nextUrl;
  const id       = searchParams.get('id');
  // `ids=a,b,c` — batched fetch for dashboard saved-job preview.
  // Caps at 10 to bound the IN list and the response size.
  const idsParam = searchParams.get('ids');
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
  // Clamp page/perPage at the route boundary so attacker-supplied or
  // fat-fingered values don't cascade into a 500. Audit found:
  //   ?perPage=-5    → range(0, -6) → PostgREST 500
  //   ?page=999999   → range(11999976, 11999987) → 500 + log noise
  //   ?perPage=100   → 8s cold start
  // perPage caps at 50 (matches the SSR listing page-size). page caps
  // at 1000 — max usable offset = 1000 * 50 = 50k, well inside the 64k
  // dataset. Higher pages can't ever have results and would just push
  // PostgREST into "offset out of range" territory.
  const rawPage    = parseInt(searchParams.get('page')    ?? '1',  10);
  const rawPerPage = parseInt(searchParams.get('perPage') ?? '12', 10);
  const page    = Number.isFinite(rawPage)    && rawPage    > 0 ? Math.min(rawPage,    1000) : 1;
  const perPage = Number.isFinite(rawPerPage) && rawPerPage > 0 ? Math.min(rawPerPage, 50)   : 12;

  try {
    // Resolve plan via the session-bound client — getRequesterPlan
    // reads from auth.users + public.profiles, both safe to query as
    // anon/authenticated.
    const sessionClient = await createServerSupabaseClient();
    const requesterPlan = await getRequesterPlan(sessionClient);
    const seePaid = canSeePaidFields(requesterPlan);

    // Always use the admin (service-role) client for the actual jobs
    // query. Supabase sets a per-role statement_timeout: anon ~3s,
    // authenticated ~8s, service_role 60s. FTS with multi-clause filters
    // over our 60k-row jobs table needed ~6s in EXPLAIN; on cold caches
    // it was tripping the 8s authenticated cap and surfacing as a 500.
    //
    // Security is preserved by column-list discipline, not by client
    // choice: anon + free callers get SAFE_JOB_COLUMNS (the migration_v16
    // safe set, no apply_url / apply_email), Day Pass / Pro / Admin get
    // '*'. The DB column-level revoke remains the wall blocking the
    // direct-REST leak path — that wall is at PostgREST + grants,
    // independent of which client we use server-side.
    const supabase = createAdminSupabaseClient();
    const cols     = seePaid ? '*' : SAFE_JOB_COLUMNS;

    // Visibility gates — see lib/jobs-visibility.ts. Filters out expired
    // postings (cron currently doesn't flip is_active=false on expiry) and
    // rows the scam-detect heuristic flagged at ingest.
    const notExpired = visibilityNotExpired();
    const notFlagged = NOT_FLAGGED;

    if (id) {
      // Malformed uuid → don't hit the DB. MOCK_JOBS ids are short strings
      // ('j1', 'j2', …) so the dev fallback still works in NODE_ENV !==
      // production where ALLOW_MOCKS is true.
      if (!UUID_RE.test(id)) {
        const mock = ALLOW_MOCKS ? MOCK_JOBS.find(j => j.id === id) : undefined;
        return NextResponse.json({ job: mock ?? null });
      }
      const { data: job } = await supabase
        .from('jobs').select(cols).eq('id', id).eq('is_active', true)
        .or(notExpired).or(notFlagged).single();
      if (job) return NextResponse.json({ job: transformJob(job, seePaid) });
      const mock = ALLOW_MOCKS ? MOCK_JOBS.find(j => j.id === id) : undefined;
      return NextResponse.json({ job: mock ?? null });
    }

    if (idsParam) {
      // Filter to well-formed UUIDs only, dedupe, cap at 10. Order in the
      // response matches the request order so the client can render the
      // saved-jobs list without re-sorting. Skipping the UUID filter
      // here let `?ids=foo,bar` 22P02 the whole .in() lookup → 500.
      const wantedIds = Array.from(new Set(
        idsParam.split(',').map(s => s.trim()).filter(s => UUID_RE.test(s))
      )).slice(0, 10);
      if (wantedIds.length === 0) return NextResponse.json({ jobs: [] });
      const { data: rows } = await supabase
        .from('jobs').select(cols).in('id', wantedIds).eq('is_active', true)
        .or(notExpired).or(notFlagged);
      const byId = new Map((rows ?? []).map((r: any) => [r.id as string, transformJob(r, seePaid)]));
      const jobs = wantedIds.map(id => byId.get(id) ?? null).filter(Boolean);
      return NextResponse.json({ jobs });
    }

    // ── Q-PRESENT PATH: relevance-ranked FTS via search_jobs RPC ───────
    // When the user is typing in the search box, we want the BEST MATCH
    // first, not the newest. The search_jobs() / search_jobs_count() pair
    // (migration v17) does FTS + ts_rank ordering inside Postgres so we
    // don't have to ship ranking columns over the wire. Falls back to
    // the listing path below when q is empty.
    const safeQ = q.replace(/[\\"]/g, ' ').trim().slice(0, 200);
    if (safeQ) {
      // Reuse REGION_TERMS to map a region/country slug to a single
      // location keyword for the RPC's ILIKE filter. The first term is
      // usually the most specific (e.g. region=africa → 'africa').
      const locTerm = (() => {
        // Array.isArray (not bare truthiness) so a user-supplied region/country
        // like `constructor` / `toString` resolves to an INHERITED Object.proto
        // member (a function) rather than a real entry — that then blew up on
        // `[0]` / `.map` below with a 500.
        if (country && Array.isArray(REGION_TERMS[country])) return REGION_TERMS[country][0];
        if (region  && Array.isArray(REGION_TERMS[region]))  return REGION_TERMS[region][0];
        return country || region || null;
      })();
      const postedDays = (posted && /^\d+$/.test(posted)) ? Math.min(365, parseInt(posted, 10)) : null;
      let salMin: number | null = null;
      let salMax: number | null = null;
      if (salary && /^\d+-\d+$/.test(salary)) {
        const [lo, hi] = salary.split('-').map(n => parseInt(n, 10) * 1000);
        if (Number.isFinite(lo) && Number.isFinite(hi)) { salMin = lo; salMax = hi; }
      }
      // search_jobs RPC does `ilike '%' || v_location || '%'` and the
      // same on v_timezone. Parameter binding stops SQL injection but
      // does NOT escape LIKE wildcards — a value like `_` or `%`
      // broadens the match to every row. Strip wildcards before
      // handing them off so a crafted `?timezone=_` (or a region label
      // that ever grows one) doesn't quietly bypass the filter.
      const escapeLike = (s: string | null): string | null =>
        s == null ? null : s.replace(/[\\%_]/g, '\\$&').slice(0, 100);
      const offset = (page - 1) * perPage;
      const args = {
        q:             safeQ,
        v_category:    category || null,
        v_type:        type     || null,
        v_level:       level    || null,
        v_remote_only: remote,
        v_location:    escapeLike(locTerm),
        v_timezone:    escapeLike(timezone || null),
        v_salary_min:  salMin,
        v_salary_max:  salMax,
        v_posted_days: postedDays,
      };
      const [rowsRes, countRes] = await Promise.all([
        supabase.rpc('search_jobs', { ...args, v_offset: offset, v_limit: perPage }),
        supabase.rpc('search_jobs_count', args),
      ]);
      if (rowsRes.error) throw new Error(rowsRes.error.message);
      let total = Number(countRes.data ?? 0);
      let jobs  = (rowsRes.data ?? []).map((j: any) => transformJob(j, seePaid));
      let fuzzy = false;

      // Trigram typo fallback — fires only when strict FTS finds nothing.
      // Catches "reactt" → React, "pythn" → Python, "designr" → Designer.
      // Surfaces results sorted by word_similarity to the query, with a
      // `fuzzy: true` flag so the UI can show a "Showing results for…"
      // hint. The 3-char minimum is enforced inside the RPCs.
      if (total === 0 && safeQ.length >= 3) {
        const [fRowsRes, fCountRes] = await Promise.all([
          supabase.rpc('search_jobs_trgm',       { ...args, v_offset: offset, v_limit: perPage }),
          supabase.rpc('search_jobs_trgm_count', args),
        ]);
        if (!fRowsRes.error) {
          total = Number(fCountRes.data ?? 0);
          jobs  = (fRowsRes.data ?? []).map((j: any) => transformJob(j, seePaid));
          fuzzy = total > 0;
        }
      }

      return NextResponse.json({
        jobs, total, page, perPage,
        pages: Math.max(1, Math.ceil(total / perPage)),
        ...(fuzzy ? { fuzzy: true } : {}),
      });
    }

    // ── NO-Q PATH: filter-only browsing ────────────────────────────────
    // count: 'exact' on the SAME query that fetches the rows. The
    // earlier "split count" optimisation traded correctness for speed —
    // counting only `is_active = true` while the data SELECT also
    // applied remote / category / type filters meant the displayed
    // "X jobs found" total stayed at 81k regardless of what the user
    // toggled. With maxDuration = 30 the ~4s seq-scan from the
    // OR-IS-NULL visibility predicates fits inside the lambda budget,
    // and PostgREST does the count + select in one round-trip.
    let query = supabase.from('jobs').select(cols, { count: 'exact' })
      .eq('is_active', true)
      .or(notExpired)
      .or(notFlagged);
    if (category) query = query.eq('category', category);
    if (type)     query = query.eq('type', type);
    if (level)    query = query.eq('level', level);
    if (remote) {
      // Match remote=true OR a remote-keyword somewhere in location —
      // via the STORED GENERATED column is_remote_compat, whose
      // expression is exactly that OR chain (COALESCE(remote,false) OR
      // location ~* '(remote|worldwide|anywhere|global|distributed|wfh)').
      // Postgres maintains it on every write and the partial index
      // jobs_is_remote_compat_idx serves it, so the per-row regex this
      // used to send (203ms warm / seconds cold over 72k index entries)
      // becomes a 34-36ms index walk with an identical result set
      // (16,435 = 16,435, verified on prod). NULL-remote semantics
      // unchanged: COALESCE(remote,false) falls through to the location
      // regex just like the old remote.eq.true OR did. See
      // supabase/migration_v32.sql; mirrors app/jobs/page.tsx.
      query = query.eq('is_remote_compat', true);
    }
    // Country takes priority over region (more specific). Both fall through
    // to a location ILIKE substring match if not in the REGION_TERMS map.
    const locFilter = country || region;
    // Array.isArray guards against user-supplied `locFilter` values that name an
    // inherited Object.prototype member ('constructor', 'toString', …): bare
    // `REGION_TERMS[locFilter]` would be a truthy function and `.map` 500s.
    if (locFilter && Array.isArray(REGION_TERMS[locFilter])) {
      const orTerms = REGION_TERMS[locFilter].map(t => `location.ilike.%${t}%`).join(',');
      query = query.or(orTerms);
    } else if (locFilter) {
      // Escape % and _ wildcards to prevent unintended broad matches.
      const safe = locFilter.replace(/[\\%_]/g, '\\$&').slice(0, 100);
      query = query.ilike('location', `%${safe}%`);
    }
    // Salary range key like "60-100" → user wants jobs paying within
    // $60k-$100k. A job matches if its listed salary range overlaps the
    // user's, evaluated three ways so we don't miss any valid overlap:
    //
    //   1) salary_max falls inside user range  (e.g. job pays "up to 90k", user 60-100k)
    //   2) salary_min falls inside user range  (e.g. job pays "from 80k", user 60-100k)
    //   3) job range fully contains user range (e.g. job pays 50-200k, user 60-100k)
    //
    // Jobs with NO salary info (salary_max IS NULL) are excluded — they
    // can't be evaluated. The earlier "include nulls" attempt swallowed
    // 99% of our data because most ATS feeds don't expose salary, making
    // the filter visibly do nothing. Strict-but-honest is the right
    // semantic: if user picks a salary band and gets 0 results, that
    // truthfully reflects how little of our data has salary info; the
    // empty state nudges them to clear the filter.
    if (salary && /^\d+-\d+$/.test(salary)) {
      const [lo, hi] = salary.split('-').map(n => parseInt(n, 10) * 1000);
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        query = query.or([
          `and(salary_max.gte.${lo},salary_max.lte.${hi})`,
          `and(salary_min.gte.${lo},salary_min.lte.${hi})`,
          `and(salary_min.lte.${lo},salary_max.gte.${hi})`,
        ].join(','));
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
    const total = count ?? 0;

    if (jobs.length > 0) {
      return NextResponse.json({
        jobs: jobs.map((j: any) => transformJob(j, seePaid)),
        total,
        page, perPage,
        pages: Math.max(1, Math.ceil(total / perPage)),
      });
    }

    return NextResponse.json({ jobs: [], total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) });
  } catch (err: any) {
    // Previously returned an empty `{ jobs: [] }` on any thrown error,
    // which made a real DB outage look identical to "your filters
    // matched nothing" — users have no way to distinguish, retry, or
    // report. Return a 500 with a structured shape so the client can
    // render a real error state, and log so ops sees it.
    logError({ event: 'jobs.get_failed', error: err?.message ?? String(err) });
    return NextResponse.json(
      { error: 'Failed to load jobs', jobs: [], total: 0, page, perPage, pages: 0 },
      { status: 500 },
    );
  }
}

// Local requireAdmin was a parallel implementation of the shared
// lib/admin/auth.ts that LACKED the `suspended` kill-switch check —
// a suspended hardcoded admin could still mutate jobs. Switched to the
// shared helper which also surfaces adminId + adminEmail for the
// audit log calls below.

const VALID_CATEGORIES = ['engineering','design','marketing','finance','sales','data','hr','product','legal','operations','other'];
const VALID_TYPES      = ['full-time','part-time','contract','freelance','internship'];
const VALID_LEVELS     = ['entry','mid','senior','lead','executive'];

// Per-field validators reused by both POST (full insert) and PATCH
// (partial update). Each returns an error string or null. Splitting
// the rule set this way lets PATCH apply the same length/whitelist
// gates to whichever subset of fields the admin sent without
// re-requiring `title` + `company`.
function validateFieldValues(body: any): string | null {
  if (body.title       !== undefined && String(body.title).length        > 200)    return 'title too long (max 200)';
  if (body.company     !== undefined && String(body.company).length      > 200)    return 'company name too long (max 200)';
  if (body.description !== undefined && String(body.description).length  > 10000)  return 'description too long (max 10000)';
  if (body.requirements!== undefined && String(body.requirements).length > 5000)   return 'requirements too long (max 5000)';
  if (body.benefits    !== undefined && String(body.benefits).length     > 3000)   return 'benefits too long (max 3000)';
  if (body.location    !== undefined && String(body.location).length     > 200)    return 'location too long (max 200)';
  if (body.category    !== undefined && !VALID_CATEGORIES.includes(body.category)) return 'invalid category';
  if (body.type        !== undefined && !VALID_TYPES.includes(body.type))          return 'invalid type';
  if (body.level       !== undefined && !VALID_LEVELS.includes(body.level))        return 'invalid level';
  // salary_min / salary_max are int4 columns. The old check only gated
  // `< 0` / NaN, so a fractional or out-of-int4-range value (e.g.
  // 3_000_000_000) reached PostgREST as a 22003 "integer out of range" and
  // surfaced as a generic 500 that looked identical to a DB outage. Bound
  // both to a non-negative int within int4 so a bad value is a clean 400.
  const INT4_MAX = 2_147_483_647;
  if (body.salaryMin !== undefined && body.salaryMin !== null) {
    const n = Number(body.salaryMin);
    if (isNaN(n) || n < 0 || !Number.isInteger(n) || n > INT4_MAX) return 'salaryMin must be an integer between 0 and 2147483647';
  }
  if (body.salaryMax !== undefined && body.salaryMax !== null) {
    const n = Number(body.salaryMax);
    if (isNaN(n) || n < 0 || !Number.isInteger(n) || n > INT4_MAX) return 'salaryMax must be an integer between 0 and 2147483647';
  }
  // skills is a text[] column — a string (or any non-string-array) reaches
  // PostgREST as a 22P02 "malformed array literal" → 500. Require a real
  // string array so a malformed payload is a clean 400.
  if (body.skills !== undefined && body.skills !== null
      && !(Array.isArray(body.skills) && body.skills.every((s: any) => typeof s === 'string'))) {
    return 'skills must be an array of strings';
  }
  // posted_at / expires_at are timestamptz — an unparseable date reaches
  // PostgREST as a 22007 → 500. Validate the shape here instead.
  if (body.posted  !== undefined && body.posted  !== null && body.posted  !== '' && Number.isNaN(Date.parse(String(body.posted))))  return 'posted must be a valid date';
  if (body.expires !== undefined && body.expires !== null && body.expires !== '' && Number.isNaN(Date.parse(String(body.expires)))) return 'expires must be a valid date';
  // Free-text columns are unbounded `text`, so these don't 500 — but an
  // unvalidated value still persists and feeds JSON-LD / emails. Cheap caps
  // + format gates keep the data clean.
  if (body.currency !== undefined && body.currency !== null && String(body.currency).length > 8)   return 'currency too long (max 8)';
  if (body.timezone !== undefined && body.timezone !== null && String(body.timezone).length > 100) return 'timezone too long (max 100)';
  if (body.logo     !== undefined && body.logo     !== null && String(body.logo).length     > 300) return 'logo too long (max 300)';
  if (body.applyEmail !== undefined && body.applyEmail !== null && body.applyEmail !== ''
      && (String(body.applyEmail).length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.applyEmail)))) {
    return 'applyEmail must be a valid email';
  }
  if (body.sourceUrl !== undefined && body.sourceUrl !== null && body.sourceUrl !== ''
      && (String(body.sourceUrl).length > 500 || !/^https?:\/\/.+/.test(String(body.sourceUrl)))) {
    return 'sourceUrl must be a valid URL';
  }
  if (body.applyUrl !== undefined && body.applyUrl !== null && body.applyUrl !== '' && !/^https?:\/\/.+/.test(body.applyUrl)) return 'applyUrl must be a valid URL';
  // jobs.company_id is a nullable uuid — short-circuit a bad shape so
  // PostgREST 22P02 doesn't cascade into the catch's 500 branch.
  if (body.companyId !== undefined && body.companyId !== null && body.companyId !== '' && !UUID_RE.test(String(body.companyId))) {
    return 'companyId must be a valid uuid';
  }
  // jobs.featured / is_active / remote are boolean columns. The admin
  // form sends real booleans, but `?featured=true` (string) or a
  // hand-crafted PATCH would 22023 the whole update. Type-check rather
  // than coercing so admins notice the malformed payload instead of it
  // silently flipping the wrong column.
  if (body.featured !== undefined && typeof body.featured !== 'boolean') return 'featured must be boolean';
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') return 'isActive must be boolean';
  if (body.remote   !== undefined && typeof body.remote   !== 'boolean') return 'remote must be boolean';
  return null;
}

function validateJobBody(body: any): string | null {
  if (!body.title?.trim())   return 'title is required';
  if (!body.company?.trim()) return 'company is required';
  return validateFieldValues(body);
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
    if (error) {
      // 23505 = unique_violation on jobs_apply_url_idx (migration_v25):
      // a posting with this apply URL already exists. Return a clear 409
      // instead of a generic 500 so the admin knows it's a duplicate, not
      // a server fault — and we don't silently edit the existing row.
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: 'A job with this apply URL already exists.' },
          { status: 409 },
        );
      }
      throw new Error('insert_failed');
    }
    // Flush /jobs cache + the new job's own detail page so they appear
    // on the public surface immediately instead of after the next
    // revalidate tick.
    safeRevalidate('/jobs', `/jobs/${job.id}`);
    await recordAdminAction({
      adminId: auth.adminId, adminEmail: auth.adminEmail,
      action: 'job.create', targetType: 'job', targetId: job.id,
      metadata: { title: job.title, company: job.company, source: job.source },
    });
    return NextResponse.json({ job: transformJob(job) }, { status: 201 });
  } catch (err: any) {
    logError({ event: 'jobs.post_failed', error: err?.message ?? String(err) });
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
    // Same per-field whitelist + length/value gates as POST. The
    // previous PATCH happily accepted `category: "foo"`, an unbounded
    // title, or a `javascript:` applyUrl — none of those were exploitable
    // through the rendering path (apply URLs go through isSafeOpenUrl,
    // text fields go through React text nodes) but they leak straight
    // into the DB. Apply the same gates we already promise on POST.
    const validationError = validateFieldValues(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
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

    // A body with no recognised field leaves `updates` empty; PostgREST
    // rejects an empty UPDATE (or no-ops and returns a misleading 200 with an
    // audit entry recording zero changed columns). Fail fast with a clear 400.
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    // maybeSingle (not single): an unknown/concurrently-deleted id matches
    // zero rows. single() would return a PGRST116 error → generic 500; we want
    // a clean 404 so the admin can tell "gone" from "server fault".
    const { data: job, error } = await supabase.from('jobs').update(updates).eq('id', id).select().maybeSingle();
    if (error) {
      // 23505 = unique_violation on jobs_apply_url_idx — the admin edited the
      // apply URL to one that already exists on another row. Mirror POST's 409
      // so it reads as a duplicate, not a server fault.
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'A job with this apply URL already exists.' }, { status: 409 });
      }
      throw new Error('update_failed');
    }
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    safeRevalidate('/jobs', `/jobs/${id}`);
    await recordAdminAction({
      adminId: auth.adminId, adminEmail: auth.adminEmail,
      action: 'job.update', targetType: 'job', targetId: id,
      // Track which columns the admin changed without dumping the full
      // before/after — that bloats the audit table and risks PII echo.
      metadata: { changed_columns: Object.keys(updates) },
    });
    return NextResponse.json({ job: transformJob(job) });
  } catch (err: any) {
    logError({ event: 'jobs.patch_failed', error: err?.message ?? String(err) });
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
    // Capture the row before delete so the audit metadata has the job
    // title/company even after the row is gone. Critical for "who
    // deleted what" forensics — without it, an audit entry pointing at
    // a no-longer-existing UUID is nearly useless.
    const { data: existing } = await supabase
      .from('jobs')
      .select('title, company, source')
      .eq('id', id)
      .maybeSingle();
    const { error } = await supabase.from('jobs').delete().eq('id', id);
    if (error) throw new Error('delete_failed');
    // Flush the listing AND the now-404 detail page so a stale cached
    // copy of the deleted job doesn't keep serving for up to 5 minutes.
    safeRevalidate('/jobs', `/jobs/${id}`);
    await recordAdminAction({
      adminId: auth.adminId, adminEmail: auth.adminEmail,
      action: 'job.delete', targetType: 'job', targetId: id,
      metadata: existing ?? { note: 'row already gone at delete time' },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    logError({ event: 'jobs.delete_failed', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Failed to delete job. Please try again.' }, { status: 500 });
  }
}

// `seePaid` controls whether the off-site application channel
// (apply_url + apply_email) is included in the response. Anonymous and
// Free-plan requesters get `null` for both, mirroring what the SSR
// /jobs/[id] page sends to free users. Defaults to true for non-API
// callers that haven't been updated to pass the flag.
function transformJob(j: any, seePaid: boolean = true) {
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
    applyUrl:     seePaid ? (j.apply_url   ?? null) : null,
    applyEmail:   seePaid ? (j.apply_email ?? null) : null,
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
