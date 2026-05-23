// app/api/cron/expire-daily/route.ts
// Runs every hour — downgrades expired Day Pass users back to free
// Add to vercel.json: { "path": "/api/cron/expire-daily", "schedule": "0 * * * *" }
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET ?? '';
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();

  // Find expired daily subscriptions
  const { data: expired } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('billing', 'daily')
    .eq('status', 'active')
    .lt('current_period_end', now);

  if (!expired?.length) {
    return NextResponse.json({ expired: 0, message: 'No expired day passes' });
  }

  const expiredIds = expired.map((s: { user_id: string }) => s.user_id);

  // Downgrade to free
  await supabase.from('profiles').update({ plan: 'free' }).in('id', expiredIds);
  await supabase.from('subscriptions').update({ status: 'expired' })
    .in('user_id', expiredIds).eq('billing', 'daily');

  return NextResponse.json({ expired: expiredIds.length });
}
