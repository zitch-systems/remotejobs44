// app/api/saved-jobs/route.ts
//
// Server-side persistence for the "Save" / "Unsave" affordance on
// JobCard + JobActionsCard. The `saved_jobs` table has existed since
// the original schema (with RLS scoped to own user and a UNIQUE on
// (user_id, job_id)), but nothing wrote to it — saves only lived in
// Zustand → localStorage, so they didn't follow the user across
// devices and disappeared on a localStorage clear.
//
// The store now mirrors every toggle to this route. The route stays
// thin — RLS + the unique constraint do the real work — so the cost
// of being out of sync (network blip, brief offline) is a single
// silently-failed write that the next page load reconciles via the
// GET fetch.
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { recomputeAndPersistProfileCompletion } from '@/lib/auth/profile-completion-persist';
import { logError } from '@/lib/log';
import { waitUntil } from '@vercel/functions';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET — list the caller's saved job IDs. Returns just the IDs (no
// join) because the client already calls /api/jobs?ids=... to hydrate
// the full Job objects for whatever it actually renders.
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('saved_jobs')
    .select('job_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    logError({ event: 'saved_jobs.list_failed', user_id: user.id, error: error.message });
    return NextResponse.json({ error: 'Failed to load saved jobs.' }, { status: 500 });
  }

  return NextResponse.json({
    savedJobIds: (data ?? []).map((r: { job_id: string }) => r.job_id),
  });
}

// POST { jobId } — save a job. UNIQUE on (user_id, job_id) means
// re-saving the same job is idempotent: we catch the 23505 and
// return 200 the same as a first-time save. Keeps the client's
// optimistic UX honest even if a duplicate toggle slips through.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { jobId?: string } = {};
  try { body = await req.json(); } catch {}
  const jobId = String(body.jobId ?? '');
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: 'Invalid jobId' }, { status: 400 });
  }

  const { error } = await supabase
    .from('saved_jobs')
    .insert({ user_id: user.id, job_id: jobId });

  if (error) {
    // 23505 unique_violation = already saved; idempotent success.
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ saved: true, deduplicated: true });
    }
    // 23503 foreign_key_violation = jobId doesn't reference a real
    // job. Surface as 404 so the client can fail the toggle without
    // a 500 noise event.
    if ((error as { code?: string }).code === '23503') {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    logError({ event: 'saved_jobs.insert_failed', user_id: user.id, job_id: jobId, error: error.message });
    return NextResponse.json({ error: 'Failed to save job.' }, { status: 500 });
  }

  // Bump profile_completion if this just crossed the ≥1-saved
  // threshold. Fire-and-forget — UI doesn't block on it.
  waitUntil(recomputeAndPersistProfileCompletion({
    id:               user.id,
    email:            user.email,
    emailConfirmedAt: user.email_confirmed_at,
  }));

  return NextResponse.json({ saved: true });
}

// DELETE { jobId } — unsave. Returns the count so the client can
// distinguish "removed" from "wasn't yours / didn't exist".
export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Read jobId from the query string. DELETE-with-body is
  // standards-compliant but unreliable end-to-end: some CDNs,
  // corporate proxies, and older mobile browsers strip the body
  // before it reaches the lambda, which would land here as
  // `body = {}` → 400 → silent unsave failure for those users.
  // Query string is universally proxied through.
  //
  // Body fallback kept for backwards compat with any in-flight
  // requests minted before the client switched.
  let jobId = req.nextUrl.searchParams.get('jobId')?.trim() ?? '';
  if (!jobId) {
    try {
      const body = await req.json();
      jobId = String((body as { jobId?: string })?.jobId ?? '').trim();
    } catch {}
  }
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: 'Invalid jobId' }, { status: 400 });
  }

  const { count, error } = await supabase
    .from('saved_jobs')
    .delete({ count: 'exact' })
    .eq('user_id', user.id)
    .eq('job_id', jobId);

  if (error) {
    logError({ event: 'saved_jobs.delete_failed', user_id: user.id, job_id: jobId, error: error.message });
    return NextResponse.json({ error: 'Failed to unsave job.' }, { status: 500 });
  }

  return NextResponse.json({ saved: false, removed: count ?? 0 });
}
