// app/api/alerts/route.ts — Job alerts management
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { resolvePlan } from '@/lib/auth/plan';
import { canUseJobAlerts } from '@/lib/auth/requester-plan';

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('job_alerts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // Ship the entitlement alongside the rows so the client renders the
  // upgrade state from the server's answer rather than re-deriving plan
  // rules from the Zustand store — that copy is persisted in localStorage
  // and a user can edit it, and resolvePlan's expiry handling is subtle
  // enough that a second implementation would drift.
  const { data: profile } = await supabase
    .from('profiles').select('plan, role, plan_expires_at').eq('id', user.id).maybeSingle();
  const plan = resolvePlan({ role: profile?.role, dbPlan: profile?.plan, planExpiresAt: profile?.plan_expires_at });

  return NextResponse.json({
    alerts: data ?? [],
    canCreate: canUseJobAlerts(plan),
    emailConfirmed: !!user.email_confirmed_at,
  });
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

  // Subscriber gate. Alerts are a Pro perk (canUseJobAlerts) and the daily
  // cron filters its send loop the same way, so letting anyone else create
  // one just writes a row that never produces an email — the user ticks a
  // box, sees the alert listed, and waits forever for mail we were never
  // going to send. Refuse at the door instead.
  // Effective plan (expired → free), not the raw column — the daily cron
  // is the only thing that flips profiles.plan after expiry.
  const { data: profile } = await supabase
    .from('profiles').select('plan, role, plan_expires_at').eq('id', user.id).maybeSingle();
  const plan = resolvePlan({ role: profile?.role, dbPlan: profile?.plan, planExpiresAt: profile?.plan_expires_at });
  if (!canUseJobAlerts(plan)) {
    return NextResponse.json(
      { error: 'Job alerts are a Pro feature. Upgrade to a monthly or annual plan to get new roles emailed to you.',
        upgrade: true },
      { status: 403 },
    );
  }

  // Per-user cap so one account can't bloat the table (and the cron's send
  // loop) with hundreds of alerts.
  const MAX_ALERTS = 50;
  const { count: existingCount } = await supabase
    .from('job_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if ((existingCount ?? 0) >= MAX_ALERTS) {
    return NextResponse.json(
      { error: `You've reached the ${MAX_ALERTS}-alert limit. Delete an old alert before adding a new one.` },
      { status: 403 },
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
