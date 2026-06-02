// lib/ats-refresh.ts
// Recurring refresh of the ATS company boards already represented in the jobs
// table.
//
// Why this exists: ATS jobs (source='api') are imported once via the admin
// company-import / companies-refresh flow and were then never re-touched. The
// daily staleness sweep (app/api/cron/daily) deactivates any job whose
// last_seen_at is older than 60 days, so without a recurring "we still see
// this posting" signal every ATS posting was deactivated 60 days after we
// inserted it — even when the company still listed it. That single defect is
// what shrinks the public job count over time (the free aggregator feeds are a
// rounding error next to the ~34k ATS jobs).
//
// This module derives the ~1.1k distinct boards straight from jobs.source_url
// (via the stale_ats_boards() SQL function), re-fetches the least-recently-
// refreshed ones within a time budget, and for every posting still listed
// upstream: bumps last_seen_at AND reactivates it if the sweep had already
// retired it. Reactivation is safe here because admin_actions shows no company
// has ever been manually removed — so every inactive ATS row was retired by
// the sweep, not by an admin. Genuinely-new postings are inserted. Best-effort
// and fully isolated: one board failing never aborts the run, and the time
// budget keeps it comfortably inside the caller's maxDuration.
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { fetchATSJobs } from '@/lib/ats-engine';
import { isValidATSPlatform, type ATSPlatform } from '@/lib/ats-detect';
import { dedupeByApplyUrl } from '@/lib/dedupe-jobs';
import { logInfo, logWarn } from '@/lib/log';

type AdminSupabase = ReturnType<typeof createAdminSupabaseClient>;

// Mirrors /api/admin/companies/refresh — the search_vector GIN trigger on the
// jobs table can't take large INSERT batches reliably.
const INSERT_CHUNK = 25;
const SEEN_CHUNK = 200;

export interface ATSRefreshResult {
  boardsConsidered: number;
  boardsRefreshed: number;
  added: number;
  reactivated: number;
  errors: number;
  timedOut: boolean;
}

// Reverse of each ATS fetcher's URL builder in lib/ats-engine.ts: recover
// (platform, slug) from a stored jobs.source_url so the board can be re-fetched
// via fetchATSJobs. Returns null for any URL shape we don't recognise (the
// caller then skips that board). Exported for unit testing.
export function parseATSApiUrl(
  raw: string | null | undefined,
): { platform: ATSPlatform; slug: string } | null {
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  const seg = (re: RegExp): string | null => path.match(re)?.[1] ?? null;

  let platform: ATSPlatform | null = null;
  let slug: string | null = null;

  if (host === 'boards-api.greenhouse.io')      { platform = 'greenhouse';      slug = seg(/^\/v1\/boards\/([^/]+)\/jobs/); }
  else if (host === 'api.lever.co')             { platform = 'lever';           slug = seg(/^\/v0\/postings\/([^/]+)/); }
  else if (host === 'api.ashbyhq.com')          { platform = 'ashby';           slug = seg(/^\/posting-api\/job-board\/([^/]+)/); }
  else if (host === 'apply.workable.com')       { platform = 'workable';        slug = seg(/^\/api\/v3\/accounts\/([^/]+)\/jobs/); }
  else if (host === 'api.smartrecruiters.com')  { platform = 'smartrecruiters'; slug = seg(/^\/v1\/companies\/([^/]+)\/postings/); }
  else if (host.endsWith('.recruitee.com'))     { platform = 'recruitee';       slug = host.slice(0, -'.recruitee.com'.length); }
  else if (host.endsWith('.jobs.personio.de'))  { platform = 'personio';        slug = host.slice(0, -'.jobs.personio.de'.length); }
  else if (host.endsWith('.bamboohr.com'))      { platform = 'bamboohr';        slug = host.slice(0, -'.bamboohr.com'.length); }
  else if (host.endsWith('.breezy.hr'))         { platform = 'breezy';          slug = host.slice(0, -'.breezy.hr'.length); }

  if (!platform || !slug) return null;
  // slug is spliced into an outbound URL by fetchATSJobs — constrain it to the
  // same safe charset /api/admin/companies/refresh enforces.
  if (!/^[a-z0-9._-]{1,80}$/i.test(slug)) return null;
  if (!isValidATSPlatform(platform)) return null;
  return { platform, slug };
}

// Map an ATS fetcher's Partial<Job> (camelCase) onto a jobs-table row
// (snake_case). Mirrors app/api/admin/companies/refresh/route.ts so the manual
// and recurring ATS paths insert identical shapes.
function toJobRow(j: any): Record<string, any> {
  return {
    title:        j.title ?? 'Untitled',
    company:      j.company ?? 'Unknown',
    logo:         j.logo ?? (j.company ? String(j.company)[0] : '?'),
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
  };
}

// For every apply_url still listed on a board: bump last_seen_at, and flip
// is_active back on for any the sweep had retired. Returns how many rows were
// reactivated (were inactive → now active). Chunked; never marks is_new.
async function markSeen(supabase: AdminSupabase, urls: string[]): Promise<number> {
  const list = Array.from(new Set(urls.filter(Boolean)));
  if (list.length === 0) return 0;
  const now = new Date().toISOString();
  let reactivated = 0;
  for (let i = 0; i < list.length; i += SEEN_CHUNK) {
    const batch = list.slice(i, i + SEEN_CHUNK);
    try {
      // Reactivate the retired ones first so the count is exact…
      const { data } = await supabase
        .from('jobs')
        .update({ is_active: true, last_seen_at: now })
        .in('apply_url', batch)
        .eq('is_active', false)
        .select('id');
      reactivated += data?.length ?? 0;
      // …then keep the already-active ones fresh.
      await supabase
        .from('jobs')
        .update({ last_seen_at: now })
        .in('apply_url', batch)
        .eq('is_active', true);
    } catch (err: any) {
      logWarn({ event: 'ats_refresh.mark_seen_failed', error: err?.message ?? String(err) });
    }
  }
  return reactivated;
}

// Refresh the least-recently-seen ATS boards within a time budget. Oldest-first
// (stale_ats_boards orders by max(last_seen_at) asc) so the boards closest to
// the 60-day cliff are always handled — guaranteeing that with even a small
// daily budget no still-listed board ages out (1.1k boards / 60 days ≈ 19
// boards/day to stay ahead).
export async function refreshStaleATSBoards(
  supabase: AdminSupabase,
  opts: { budgetMs?: number; maxBoards?: number } = {},
): Promise<ATSRefreshResult> {
  const budgetMs = opts.budgetMs ?? 45_000;
  const maxBoards = opts.maxBoards ?? 150;
  const startedAt = Date.now();
  const res: ATSRefreshResult = {
    boardsConsidered: 0, boardsRefreshed: 0, added: 0, reactivated: 0, errors: 0, timedOut: false,
  };

  const { data: boards, error } = await supabase.rpc('stale_ats_boards', { p_limit: maxBoards });
  if (error) {
    logWarn({ event: 'ats_refresh.rpc_failed', error: error.message });
    return res;
  }
  const list = (boards ?? []) as Array<{ source_url: string }>;
  res.boardsConsidered = list.length;

  for (const board of list) {
    if (Date.now() - startedAt > budgetMs) { res.timedOut = true; break; }
    const parsed = parseATSApiUrl(board.source_url);
    if (!parsed) continue;
    try {
      const fetched = await fetchATSJobs(parsed.platform, parsed.slug, board.source_url);
      if (fetched.error) {
        res.errors++;
        logWarn({ event: 'ats_refresh.board_fetch_failed', platform: parsed.platform, slug: parsed.slug, error: fetched.error });
        continue;
      }

      const rows = dedupeByApplyUrl(fetched.jobs.map(toJobRow).filter(r => !!r.apply_url));
      if (rows.length === 0) { res.boardsRefreshed++; continue; }

      // 1) Keep still-listed postings alive + recover any the sweep retired.
      res.reactivated += await markSeen(supabase, rows.map(r => r.apply_url as string));

      // 2) Insert genuinely-new postings (ON CONFLICT DO NOTHING).
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const { data, error: insErr } = await supabase
          .from('jobs')
          .upsert(rows.slice(i, i + INSERT_CHUNK), { onConflict: 'apply_url', ignoreDuplicates: true })
          .select('id');
        if (insErr) { res.errors++; continue; }
        res.added += data?.length ?? 0;
      }
      res.boardsRefreshed++;
    } catch (err: any) {
      res.errors++;
      logWarn({ event: 'ats_refresh.board_failed', source_url: board.source_url, error: err?.message ?? String(err) });
    }
  }

  logInfo({ event: 'ats_refresh.done', ...res, elapsedMs: Date.now() - startedAt });
  return res;
}
