// app/api/profile/billing/route.ts
// Returns the signed-in user's subscription record. The subscriptions table
// only holds the current row per user (unique on user_id), so this is more
// "current plan + last period" than a multi-row invoice history. If we ever
// add a separate paystack_charges table, this is where it'll join.
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: subscription, error: subErr } = await supabase
    .from('subscriptions')
    .select('plan,billing,price,currency,status,current_period_start,current_period_end,created_at,updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });

  return NextResponse.json({ subscription: subscription ?? null });
}
