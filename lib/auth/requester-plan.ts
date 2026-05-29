// lib/auth/requester-plan.ts
//
// Resolve the effective plan of the *current request* on the server side.
// Used by /api/jobs and the SSR /jobs pages to decide whether to expose
// off-site apply links — Free + anonymous get them stripped; Day Pass /
// Pro / admin see the real URL.
//
// Why server-side: the client-side paywall in JobCard / JobActionsCard
// is a UX gate, not a security boundary. A scraper that requests
// /api/jobs directly (or pulls the React tree from /jobs/[id]) sees the
// real applyUrl unless the SERVER decides not to send it. This helper
// gives the server an honest answer to "should this caller see paid
// fields?" without re-implementing plan/expiry/admin logic per route.
//
// Note on the broader threat: the Supabase anon key still lets anyone
// hit `<project>.supabase.co/rest/v1/jobs?select=*` directly. This
// helper closes the Next.js-facing leak; the REST-direct leak needs a
// view-based RLS refactor (track separately).
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePlan, type Plan } from '@/lib/auth/plan';
import { isHardcodedAdmin } from '@/lib/admin-emails';

export type RequesterPlan = Plan | 'anon';

export async function getRequesterPlan(supabase: SupabaseClient): Promise<RequesterPlan> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return 'anon';

    // Hardcoded admin emails count as admin even before the profiles row
    // is provisioned — same shortcut middleware + requireAdmin use.
    if (isHardcodedAdmin(user.email)) return 'admin';

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, plan, plan_expires_at')
      .eq('id', user.id)
      .maybeSingle();

    return resolvePlan({
      role:          profile?.role,
      dbPlan:        profile?.plan,
      planExpiresAt: profile?.plan_expires_at,
    });
  } catch {
    // Fail closed — treat as anon, the most-restricted bucket.
    return 'anon';
  }
}

/**
 * True when the requester is entitled to see off-site apply links
 * (`apply_url` / `apply_email`) and any other paid fields. Free + anon
 * get the gated view; Day Pass (paying) and above see the real value.
 *
 * Day Pass is included on purpose: paying customers see real URLs, with
 * a separate server-tracked /api/applications quota capping their daily
 * uses. The cosmetic blur on JobCard remains as a marketing nudge but
 * is no longer the only line of defence.
 */
export function canSeePaidFields(plan: RequesterPlan): boolean {
  return plan === 'daily' || plan === 'pro' || plan === 'admin';
}

/**
 * The columns of `public.jobs` that anon + authenticated roles can SELECT.
 *
 * After migration_v16 the anon and authenticated roles no longer have
 * SELECT permission on `apply_url` or `apply_email` — so a query that
 * sends `.select('*')` as either role returns 403 from PostgREST. The
 * server-side reads in /api/jobs, /jobs SSR, and /jobs/[id] SSR therefore
 * have to enumerate the safe columns explicitly when using the session-
 * bound client.
 *
 * When the requester is on a paid tier (canSeePaidFields → true), the
 * code switches to `createAdminSupabaseClient()` (service role bypasses
 * column grants) and selects `'*'` — that path is the only way apply_url
 * reaches the wire.
 *
 * Keep this list in lock-step with migration_v16.sql's GRANT SELECT
 * column list. A new column added to `public.jobs` needs to be added in
 * BOTH places before anon/authenticated callers can read it.
 */
export const SAFE_JOB_COLUMNS =
  'id, title, company, company_id, logo,' +
  ' category, type, level, location, timezone,' +
  ' description, requirements, skills, benefits,' +
  ' salary_min, salary_max, currency,' +
  ' remote, featured, is_new, is_active,' +
  ' source, source_url, views, applications,' +
  ' posted_at, expires_at, created_at,' +
  ' flagged, flagged_reason';
