// app/api/admin/agents/route.ts
// Admin overview of all agents: who they are, their referral code + rate, and
// their headline performance (referred signups, paying subscribers, charges,
// commission owed). Admin-only.
//
// Aggregates are computed from two batched fetches (referred profiles +
// commission rows) keyed by agent, so the cost scales with referral volume —
// not with the high-traffic referral_clicks table, which the admin list
// deliberately leaves out (clicks live in each agent's own portal).
import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { logError } from '@/lib/log';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const admin = createAdminSupabaseClient();

    const { data: agents, error: agentsErr } = await admin
      .from('profiles')
      .select('id, name, email, referral_code, commission_rate, created_at, suspended')
      .eq('role', 'agent')
      .order('created_at', { ascending: false });
    if (agentsErr) throw agentsErr;

    const agentIds = (agents ?? []).map(a => a.id);
    if (agentIds.length === 0) return NextResponse.json({ agents: [] });

    const [signupsRes, commissionsRes] = await Promise.all([
      admin.from('profiles').select('referred_by').in('referred_by', agentIds).limit(50000),
      admin.from('agent_commissions')
        .select('agent_id, commission_amount, referred_user_id, status')
        .in('agent_id', agentIds).limit(50000),
    ]);

    const signupsByAgent = new Map<string, number>();
    for (const r of signupsRes.data ?? []) {
      const k = r.referred_by as string;
      signupsByAgent.set(k, (signupsByAgent.get(k) ?? 0) + 1);
    }

    const commByAgent = new Map<string, { charges: number; subscribers: Set<string>; total: number; unpaid: number }>();
    for (const r of commissionsRes.data ?? []) {
      const k = r.agent_id as string;
      const e = commByAgent.get(k) ?? { charges: 0, subscribers: new Set<string>(), total: 0, unpaid: 0 };
      e.charges += 1;
      if (r.referred_user_id) e.subscribers.add(r.referred_user_id as string);
      const c = Number(r.commission_amount ?? 0);
      e.total += c;
      if (r.status !== 'paid' && r.status !== 'reversed') e.unpaid += c;
      commByAgent.set(k, e);
    }

    const out = (agents ?? []).map(a => {
      const c = commByAgent.get(a.id);
      return {
        id: a.id,
        name: a.name,
        email: a.email,
        referral_code: a.referral_code,
        commission_rate: Number(a.commission_rate ?? 0),
        suspended: a.suspended ?? false,
        created_at: a.created_at,
        signups: signupsByAgent.get(a.id) ?? 0,
        subscribers: c ? c.subscribers.size : 0,
        charges: c ? c.charges : 0,
        total_commission: c ? round2(c.total) : 0,
        unpaid_commission: c ? round2(c.unpaid) : 0,
      };
    });

    return NextResponse.json({ agents: out });
  } catch (err: any) {
    logError({ event: 'admin.agents_list_failed', error: err?.message ?? String(err) });
    return NextResponse.json({ agents: [], error: 'Failed to load agents' }, { status: 500 });
  }
}
