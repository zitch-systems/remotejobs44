// app/api/recommendations/route.ts
//
// "Recommended for you" feed. Looks at the categories + skills the
// caller has engaged with (saved or applied) and returns up to 12
// active jobs that share at least one signal but aren't already saved
// or applied to.
//
// Scoring is intentionally simple — exact matches on category and
// overlapping skills, ordered by score then posted_at. We're not
// running a vector model; the signal is "you've shown interest in X,
// here are more X" and that's the read users have when they look at
// this row.
//
// Falls back to category-only matching when the user has fewer than 3
// engagement signals, and falls all the way back to "featured + newest"
// when they have zero — so a brand-new visitor still sees something
// useful at the bottom of /dashboard.
import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import { notExpired, NOT_FLAGGED } from '@/lib/jobs-visibility';
import { getRequesterPlan, canSeePaidFields, SAFE_JOB_COLUMNS } from '@/lib/auth/requester-plan';
import { logError } from '@/lib/log';

const RECOMMENDATION_LIMIT = 12;
// Pull a wider candidate pool than we ship — gives us headroom to
// filter out the user's existing saved/applied set and still return
// the full RECOMMENDATION_LIMIT.
const CANDIDATE_POOL = 200;

export async function GET() {
  const session = await createServerSupabaseClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const admin = createAdminSupabaseClient();
    // What we read about the user's history. Cap at 50 each so the
    // signal-extraction stays fast even on a heavy-user account.
    const [savedRes, appsRes] = await Promise.all([
      admin.from('saved_jobs')
        .select('job_id')
        .eq('user_id', user.id)
        .limit(50),
      admin.from('applications')
        .select('job_id')
        .eq('user_id', user.id)
        .limit(50),
    ]);

    const savedIds = (savedRes.data ?? []).map((r: { job_id: string }) => r.job_id);
    const appsIds  = (appsRes.data  ?? []).map((r: { job_id: string }) => r.job_id);
    const seenIds  = Array.from(new Set([...savedIds, ...appsIds]));

    // Extract signals (categories + skills) from the engaged-with set.
    // Single batched read with the relevant columns only.
    let categories: string[] = [];
    let skills: string[]     = [];
    if (seenIds.length > 0) {
      const { data: history } = await admin
        .from('jobs')
        .select('category, skills')
        .in('id', seenIds.slice(0, 50));
      const seenCategories = new Set<string>();
      const seenSkills     = new Set<string>();
      for (const r of (history ?? []) as Array<{ category: string | null; skills: string[] | null }>) {
        if (r.category) seenCategories.add(r.category.toLowerCase());
        if (Array.isArray(r.skills)) {
          for (const s of r.skills) {
            if (typeof s === 'string' && s.length > 0) seenSkills.add(s.toLowerCase());
          }
        }
      }
      categories = Array.from(seenCategories);
      skills     = Array.from(seenSkills);
    }

    // Plan-gating mirrors /api/jobs: anon/free callers get
    // SAFE_JOB_COLUMNS, paid get '*'.
    const requesterPlan = await getRequesterPlan(session);
    const seePaid = canSeePaidFields(requesterPlan);
    const cols    = seePaid ? '*' : SAFE_JOB_COLUMNS;

    let candidates: any[] = [];

    if (categories.length === 0 && skills.length === 0) {
      // Cold-start fallback — feature the platform's freshest curated
      // postings so /dashboard always renders something here.
      const { data } = await admin
        .from('jobs')
        .select(cols)
        .eq('is_active', true)
        .or(notExpired())
        .or(NOT_FLAGGED)
        .order('featured', { ascending: false })
        .order('posted_at', { ascending: false })
        .limit(RECOMMENDATION_LIMIT * 2);
      candidates = data ?? [];
    } else {
      // Category match is the dominant signal — fetch the candidate
      // pool from postings in those categories. Skills overlap then
      // becomes a score multiplier in the scoring step below.
      let q = admin
        .from('jobs')
        .select(cols)
        .eq('is_active', true)
        .or(notExpired())
        .or(NOT_FLAGGED)
        .order('posted_at', { ascending: false })
        .limit(CANDIDATE_POOL);
      if (categories.length > 0) q = q.in('category', categories);
      const { data } = await q;
      candidates = data ?? [];
    }

    // Strip the user's existing set + score what remains.
    const seenSet = new Set(seenIds);
    const skillsSet = new Set(skills);
    const scored = candidates
      .filter((j: any) => !seenSet.has(j.id))
      .map((j: any) => {
        let score = 0;
        if (j.category && categories.includes(String(j.category).toLowerCase())) score += 2;
        if (Array.isArray(j.skills)) {
          for (const s of j.skills) {
            if (typeof s === 'string' && skillsSet.has(s.toLowerCase())) score += 1;
          }
        }
        if (j.featured) score += 0.5; // small bias toward featured rows
        return { j, score };
      })
      // Highest score first, posted_at as the tiebreaker.
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        const da = new Date(a.j.posted_at ?? 0).getTime();
        const db = new Date(b.j.posted_at ?? 0).getTime();
        return db - da;
      })
      .slice(0, RECOMMENDATION_LIMIT)
      .map(s => s.j);

    return NextResponse.json({
      jobs: scored.map((j: any) => transform(j, seePaid)),
      total: scored.length,
      // Surface enough about the source so the UI can label correctly
      // ("Picked from your saved jobs" vs "Featured remote roles"). Key
      // off whether we actually extracted signals — a user whose history
      // is all null-category/empty-skills falls into the featured branch,
      // so reporting 'history' just because seenIds>0 would mislabel it.
      basis: (categories.length > 0 || skills.length > 0) ? 'history' : 'featured',
    });
  } catch (err: any) {
    logError({ event: 'recommendations.failed', user_id: user.id, error: err?.message ?? String(err) });
    return NextResponse.json({ jobs: [], total: 0, basis: 'error' }, { status: 200 });
  }
}

function transform(j: any, seePaid: boolean) {
  return {
    id:           j.id,
    title:        j.title,
    company:      j.company,
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
    skills:       j.skills ?? [],
    applyUrl:     seePaid ? (j.apply_url   ?? null) : null,
    applyEmail:   seePaid ? (j.apply_email ?? null) : null,
    posted:       j.posted_at ?? j.created_at,
    featured:     j.featured ?? false,
    isNew:        j.is_new ?? false,
    source:       j.source ?? 'manual',
    remote:       j.remote ?? true,
  };
}
