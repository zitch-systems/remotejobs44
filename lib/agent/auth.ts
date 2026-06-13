// lib/agent/auth.ts — shared agent-route guard. Mirrors lib/admin/auth.ts.
//
// Returns:
//   { ok: true,  agentId, agentEmail, referralCode, commissionRate }
//   { ok: false, res: NextResponse(401) }   no session
//   { ok: false, res: NextResponse(403) }   authed but not an agent / suspended
//
// The agent portal is NOT gated on the agent's own subscription — being an
// agent (role='agent') is what unlocks it. Their personal job-seeker access
// is gated by plan elsewhere, exactly like any other user.
import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';

export type RequireAgentResult =
  | { ok: true; agentId: string; agentEmail: string | null; referralCode: string | null; commissionRate: number }
  | { ok: false; res: NextResponse };

export async function requireAgent(): Promise<RequireAgentResult> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  // Service-role read: referral_code / commission_rate aren't in the
  // column-level grants the session client could select, and we want the
  // role check to be authoritative regardless of RLS quirks.
  const admin = createAdminSupabaseClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role, suspended, referral_code, commission_rate')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'agent') {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  if (profile?.suspended === true) {
    return { ok: false, res: NextResponse.json({ error: 'Account suspended' }, { status: 403 }) };
  }

  return {
    ok: true,
    agentId: user.id,
    agentEmail: user.email ?? null,
    referralCode: profile.referral_code ?? null,
    commissionRate: Number(profile.commission_rate ?? 0),
  };
}
