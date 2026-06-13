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

    // Commission totals + plan mix are aggregated in the DB (RPCs) so the
    // numbers stay exact regardless of how many charges an agent accrues —
    // no row-fetch cap. Clicks + sign-ups are cheap head-counts on other
    // tables; `recent` is the bounded table feed.
    const [clicksRes, signupsRes, summaryRes, breakdownRes, recentRes] = await Promise.all([
      admin.from('referral_clicks').select('id', { count: 'exact', head: true }).eq('agent_id', agentId),
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('referred_by', agentId),
      admin.rpc('agent_commission_summary', { p_agent_id: agentId }),
      admin.rpc('agent_commission_plan_breakdown', { p_agent_id: agentId }),
      admin.from('agent_commissions')
        .select('plan, billing, amount, commission_amount, commission_rate, status, created_at')
        .eq('agent_id', agentId).order('created_at', { ascending: false }).limit(20),
    ]);

    const summary = (Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data) ?? {};
    const breakdown = (breakdownRes.data ?? []) as Array<{ plan: string; count: number; gross: number; commission: number }>;

    return NextResponse.json({
      referralCode:   auth.referralCode,
      commissionRate: auth.commissionRate,
      clicks:         clicksRes.count ?? 0,
      signups:        signupsRes.count ?? 0,
      subscriptions:  Number(summary.charges ?? 0),     // total paid charges by referrals
      subscribers:    Number(summary.subscribers ?? 0), // distinct paying referrals
      totalCommission:   round2(Number(summary.total_commission ?? 0)),
      pendingCommission: round2(Number(summary.pending_commission ?? 0)),
      paidCommission:    round2(Number(summary.paid_commission ?? 0)),
      planBreakdown: breakdown.map(b => ({
        plan: b.plan, count: Number(b.count), gross: round2(Number(b.gross)), commission: round2(Number(b.commission)),
      })),
      recent: recentRes.data ?? [],
    });
  } catch (err: any) {
    logError({ event: 'agent.stats_failed', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Failed to load agent stats' }, { status: 500 });
  }
}
