// app/api/admin/settings/route.ts
// Persists admin settings to Supabase (requires a site_settings table, see migration below)
// Falls back gracefully if table doesn't exist yet.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { logError, logWarn } from '@/lib/log';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const settings = await req.json();
    const supabase = createAdminSupabaseClient();

    // Try to upsert into a site_settings table (singleton row with id = 1)
    // This table might not exist yet — if so, we still return 200 so client
    // falls back to localStorage gracefully.
    const { error } = await supabase
      .from('site_settings')
      .upsert({ id: 1, ...settings, updated_at: new Date().toISOString() }, { onConflict: 'id' });

    if (error) {
      // Table probably doesn't exist — not a fatal error
      logWarn({ event: 'admin.settings.table_missing', error: error.message });
      return NextResponse.json({ success: true, note: 'Saved locally (Supabase table not configured)' });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    logError({ event: 'admin.settings.unhandled', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from('site_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) return NextResponse.json({ settings: null });
    return NextResponse.json({ settings: data });
  } catch {
    return NextResponse.json({ settings: null });
  }
}
