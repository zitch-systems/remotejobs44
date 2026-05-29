// app/api/alerts/route.ts — Job alerts management
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('job_alerts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ alerts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Enforce per-user alert cap so a free / abusive user can't create
  // thousands of alerts and bloat the table. Free plans get a small
  // exploration cap, paid plans get a higher one.
  const { data: profile } = await supabase
    .from('profiles').select('plan, role').eq('id', user.id).maybeSingle();
  const plan = profile?.plan ?? 'free';
  const isPaid = profile?.role === 'admin' || ['admin','daily','pro'].includes(plan);
  const maxAlerts = isPaid ? 50 : 3;

  const { count: existingCount } = await supabase
    .from('job_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if ((existingCount ?? 0) >= maxAlerts) {
    return NextResponse.json(
      { error: isPaid
          ? `You've reached the ${maxAlerts}-alert limit. Delete an old alert before adding a new one.`
          : `Free plans can create up to ${maxAlerts} alerts. Upgrade to Pro for ${50}.` },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { category, keywords, frequency } = body;

  // Whitelist + length-cap inputs so a malicious client can't write
  // megabytes of junk into the alerts table.
  const safeCategory  = category  != null ? String(category).slice(0, 50)  : null;
  const safeKeywords  = keywords  != null ? String(keywords).slice(0, 200) : null;
  const safeFrequency = ['daily','weekly'].includes(frequency) ? frequency : 'daily';

  const { data, error } = await supabase
    .from('job_alerts')
    .insert({
      user_id: user.id,
      category: safeCategory,
      keywords: safeKeywords,
      frequency: safeFrequency,
      active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alert: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  await supabase.from('job_alerts').delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ success: true });
}
