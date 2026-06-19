// app/api/admin/settings/route.ts
// Persists admin settings to Supabase (requires a site_settings table, see migration below)
// Falls back gracefully if table doesn't exist yet.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { recordAdminAction } from '@/lib/admin/audit';
import { logError, logWarn } from '@/lib/log';

// Whitelist of writable columns. Without this the raw spread below would let
// an admin (or anything that compromises an admin session) override the row's
// `id` (the singleton key) or write into columns we haven't planned for —
// classic mass-assignment.
const ALLOWED_KEYS = new Set([
  'siteName', 'supportEmail', 'jobsPerPage',
  'notifyNewUser', 'notifyNewSub', 'notifyPayFail', 'notifyDailySync',
  // Mobile App controls
  'mobileMaintenance', 'allowSignups', 'mobileMinVersion', 'mobileBannerText',
  'mobileFreeApplyLimit', 'jobArchiveDays',
]);

function pickAllowed(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (ALLOWED_KEYS.has(k)) out[k] = v;
  }
  return out;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const raw      = await req.json();
    const settings = pickAllowed(raw);
    const supabase = createAdminSupabaseClient();

    // Try to upsert into a site_settings table (singleton row with id = 1)
    // This table might not exist yet — if so, we still return 200 so client
    // falls back to localStorage gracefully. id + updated_at sit AFTER the
    // spread so a crafted body can't override the singleton key.
    const { error } = await supabase
      .from('site_settings')
      .upsert({ ...settings, id: 1, updated_at: new Date().toISOString() }, { onConflict: 'id' });

    if (error) {
      // Table probably doesn't exist — not a fatal error
      logWarn({ event: 'admin.settings.table_missing', error: error.message });
      return NextResponse.json({ success: true, note: 'Saved locally (Supabase table not configured)' });
    }

    // Track which top-level setting keys changed (the values themselves
    // can drift — a feature-flag toggle, a copy edit). Keys-only keeps
    // the audit metadata small and prevents echoing arbitrary admin-
    // supplied content back into the audit table.
    await recordAdminAction({
      adminId: auth.adminId, adminEmail: auth.adminEmail,
      action: 'settings.update', targetType: 'site_settings', targetId: '1',
      metadata: { changed_keys: Object.keys(settings ?? {}).slice(0, 50) },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    logError({ event: 'admin.settings.unhandled', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

// Mirror of the POST whitelist — if site_settings ever grows columns we
// haven't whitelisted (server-only flags, debug toggles, etc.) we don't
// want them leaking to the admin browser via select('*'). Re-list explicitly.
const READABLE_COLS = [
  'siteName', 'supportEmail', 'jobsPerPage',
  'notifyNewUser', 'notifyNewSub', 'notifyPayFail', 'notifyDailySync',
  'mobileMaintenance', 'allowSignups', 'mobileMinVersion', 'mobileBannerText',
  'mobileFreeApplyLimit', 'jobArchiveDays',
  'updated_at',
].join(',');

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from('site_settings')
      .select(READABLE_COLS)
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) return NextResponse.json({ settings: null });
    return NextResponse.json({ settings: data });
  } catch {
    return NextResponse.json({ settings: null });
  }
}
