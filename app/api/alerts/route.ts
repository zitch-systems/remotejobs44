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
  // Email-confirmation gate. Each alert results in a recurring email
  // job — unverified throwaways shouldn't enrol the daily-cron sender
  // for an unbounded set of addresses.
  if (!user.email_confirmed_at) {
    return NextResponse.json(
      { error: 'Please confirm your email address before creating alerts. Check your inbox for the verification link.' },
      { status: 403 },
    );
  }

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
  const { category, keywords } = body;

  // Whitelist + length-cap inputs so a malicious client can't write
  // megabytes of junk into the alerts table.
  const safeCategory  = category  != null ? String(category).slice(0, 50)  : null;
  const safeKeywords  = keywords  != null ? String(keywords).slice(0, 200) : null;

  const { data, error } = await supabase
    .from('job_alerts')
    .insert({
      user_id: user.id,
      category: safeCategory,
      keywords: safeKeywords,
      frequency: 'daily', // only 'daily' is supported — the daily cron has no weekly sender
      active: true,
    })
    .select()
    .single();

  if (error) {
    // Don't echo raw DB messages to the client (handler names, constraint
    // ids, etc.). Log server-side, ship a generic error.
    console.error('[alerts.post] insert failed:', error.message);
    return NextResponse.json({ error: 'Could not create alert. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ alert: data });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { id?: string } = {};
  try { body = await req.json(); } catch {}
  const id = String(body.id ?? '');
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid alert id' }, { status: 400 });
  }

  // Return how many rows were actually deleted so the client can
  // distinguish "alert removed" from "id didn't exist / wasn't yours".
  // The user_id eq() means RLS plus our explicit filter both block
  // cross-user deletes — no need to look the row up first.
  const { count, error } = await supabase
    .from('job_alerts')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[alerts.delete] failed:', error.message);
    return NextResponse.json({ error: 'Could not delete alert.' }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
