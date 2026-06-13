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

    // Sign-ups are a bounded per-agent count (one row per referred profile);
    // the money aggregates come from a single DB-side RPC so the totals are
    // exact with no row-fetch cap, however many charges exist.
    const [signupsRes, commRes] = await Promise.all([
      admin.from('profiles').select('referred_by').in('referred_by', agentIds).limit(50000),
      admin.rpc('agent_commission_admin_summary'),
    ]);

    const signupsByAgent = new Map<string, number>();
    for (const r of signupsRes.data ?? []) {
      const k = r.referred_by as string;
      signupsByAgent.set(k, (signupsByAgent.get(k) ?? 0) + 1);
    }

    type CommRow = { agent_id: string; charges: number; subscribers: number; total_commission: number; unpaid_commission: number };
    const commByAgent = new Map<string, CommRow>();
    for (const r of (commRes.data ?? []) as CommRow[]) {
      commByAgent.set(r.agent_id, r);
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
        subscribers: c ? Number(c.subscribers) : 0,
        charges: c ? Number(c.charges) : 0,
        total_commission: c ? round2(Number(c.total_commission)) : 0,
        unpaid_commission: c ? round2(Number(c.unpaid_commission)) : 0,
      };
    });

    return NextResponse.json({ agents: out });
  } catch (err: any) {
    logError({ event: 'admin.agents_list_failed', error: err?.message ?? String(err) });
    return NextResponse.json({ agents: [], error: 'Failed to load agents' }, { status: 500 });
  }
}
