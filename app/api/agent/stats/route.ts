// app/api/agent/stats/route.ts
// Powers the agent portal: referral link, click / signup / subscription
// counts, plan mix, and commission earned. Agent-only (requireAgent).
//
// Headline counts use exact head-counts (cheap, accurate). Money + plan-mix
// aggregates are computed from the agent's commission rows — bounded by their
// number of paying referrals, not by click volume.
import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAgent } from '@/lib/agent/auth';
import { logError } from '@/lib/log';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function GET() {
  const auth = await requireAgent();
  if (!auth.ok) return auth.res;

  try {
    const admin = createAdminSupabaseClient();
    const agentId = auth.agentId;

    const [clicksRes, signupsRes, chargesRes, rowsRes, recentRes] = await Promise.all([
      admin.from('referral_clicks').select('id', { count: 'exact', head: true }).eq('agent_id', agentId),
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('referred_by', agentId),
      admin.from('agent_commissions').select('id', { count: 'exact', head: true }).eq('agent_id', agentId),
      admin.from('agent_commissions')
        .select('plan, amount, commission_amount, referred_user_id, status')
        .eq('agent_id', agentId).limit(5000),
      admin.from('agent_commissions')
        .select('plan, billing, amount, commission_amount, commission_rate, status, created_at')
        .eq('agent_id', agentId).order('created_at', { ascending: false }).limit(20),
    ]);

    const rows = rowsRes.data ?? [];
    const subscribers = new Set<string>();
    const planMap = new Map<string, { count: number; gross: number; commission: number }>();
    let totalCommission = 0;
    let pendingCommission = 0;
    let paidCommission = 0;

    for (const r of rows) {
      if (r.referred_user_id) subscribers.add(r.referred_user_id as string);
      const plan = (r.plan as string) ?? 'unknown';
      const entry = planMap.get(plan) ?? { count: 0, gross: 0, commission: 0 };
      entry.count += 1;
      entry.gross += Number(r.amount ?? 0);
      entry.commission += Number(r.commission_amount ?? 0);
      planMap.set(plan, entry);
      const c = Number(r.commission_amount ?? 0);
      totalCommission += c;
      if (r.status === 'paid') paidCommission += c;
      else if (r.status !== 'reversed') pendingCommission += c;
    }

    return NextResponse.json({
      referralCode:   auth.referralCode,
      commissionRate: auth.commissionRate,
      clicks:         clicksRes.count ?? 0,
      signups:        signupsRes.count ?? 0,
      subscriptions:  chargesRes.count ?? 0,   // total paid charges by referrals
      subscribers:    subscribers.size,        // distinct paying referrals
      totalCommission:   round2(totalCommission),
      pendingCommission: round2(pendingCommission),
      paidCommission:    round2(paidCommission),
      planBreakdown: [...planMap.entries()].map(([plan, v]) => ({
        plan, count: v.count, gross: round2(v.gross), commission: round2(v.commission),
      })),
      recent: recentRes.data ?? [],
    });
  } catch (err: any) {
    logError({ event: 'agent.stats_failed', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Failed to load agent stats' }, { status: 500 });
  }
}
