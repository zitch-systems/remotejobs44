// app/api/admin/ingest-now/route.ts
// Lets an admin trigger the full job ingestion pipeline from the admin UI
// without needing to wait for the next cron tick or expose CRON_SECRET.
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isHardcodedAdmin } from '@/lib/admin-emails';
import { runIngest } from '@/lib/ingest-pipeline';

export async function POST() {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin' && !isHardcodedAdmin(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return runIngest();
  } catch (err: any) {
    console.error('[ingest-now]', err);
    return NextResponse.json({ error: err.message ?? 'Failed' }, { status: 500 });
  }
}
