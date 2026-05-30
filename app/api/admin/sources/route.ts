// app/api/admin/sources/route.ts
//
// Admin CRUD for the `job_sources` table — list + add. Per-row PATCH
// (pause/resume/rename) and DELETE live at /api/admin/sources/[id]/route.ts.
//
// Before this route existed the admin Sources UI stored everything in
// localStorage, so sources an admin added had no effect on the cron.
// Now anything written here is read by lib/ingest-pipeline.ts on every
// daily run.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { recordAdminAction } from '@/lib/admin/audit';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { validateExternalUrl } from '@/lib/ssrf-guard';
import { logError } from '@/lib/log';

type SourceMethod = 'rss' | 'json-api' | 'scrape' | 'auto' | 'unknown';
type SourceStatus = 'active' | 'paused' | 'error';

// Runtime mirror of the SourceMethod union — the TS cast on its own
// doesn't reject 'method=arbitrary-string-up-to-32-chars'. Without this
// check the value lands in the DB and lib/ingest-pipeline.ts then falls
// into its `unknown` branch, which is fine but misleading in the audit
// log ("source.create with method=hello").
const ALLOWED_METHODS = new Set<SourceMethod>(['rss', 'json-api', 'scrape', 'auto', 'unknown']);

interface SourceRow {
  id:           string;
  name:         string;
  url:          string;
  method:       string;
  status:       string;
  last_sync_at: string | null;
  jobs_added:   number;
  created_at:   string;
}

// GET — list every source. Admin UI renders one row per record.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('job_sources')
    .select('id, name, url, method, status, last_sync_at, jobs_added, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    logError({ event: 'admin.sources.list_failed', error: error.message });
    return NextResponse.json({ error: 'Failed to load sources', sources: [] }, { status: 500 });
  }
  return NextResponse.json({ sources: (data ?? []) as SourceRow[] });
}

// POST — add a new source. Validates URL via the SSRF guard so an admin
// can't accidentally point the cron at 127.0.0.1 or cloud metadata.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({}));
  const url:       string = String(body.url ?? '').trim();
  const name:      string = String(body.name ?? '').trim().slice(0, 100);
  const methodRaw: string = String(body.method ?? 'auto').trim();
  const method: SourceMethod = ALLOWED_METHODS.has(methodRaw as SourceMethod)
    ? (methodRaw as SourceMethod)
    : 'auto';

  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

  const v = validateExternalUrl(url);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }
  const cleanUrl = v.url.toString();

  const cleanName = name || extractHostName(cleanUrl);

  const supabase = createAdminSupabaseClient();
  // upsert by url so re-adding an existing source flips it back to active
  // and refreshes name/method instead of erroring on the unique constraint.
  const { data, error } = await supabase
    .from('job_sources')
    .upsert(
      {
        name:   cleanName,
        url:    cleanUrl,
        method,
        status: 'active' as SourceStatus,
      },
      { onConflict: 'url' },
    )
    .select('id, name, url, method, status, last_sync_at, jobs_added, created_at')
    .single();
  if (error || !data) {
    logError({ event: 'admin.sources.create_failed', error: error?.message ?? 'unknown' });
    return NextResponse.json({ error: 'Failed to create source' }, { status: 500 });
  }
  await recordAdminAction({
    adminId: auth.adminId, adminEmail: auth.adminEmail,
    action: 'source.create', targetType: 'source', targetId: data.id,
    metadata: { name: data.name, url: cleanUrl, method },
  });
  return NextResponse.json({ source: data as SourceRow }, { status: 201 });
}

function extractHostName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.split('.')[0] || host;
  } catch {
    return 'source';
  }
}
