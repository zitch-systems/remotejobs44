import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { isHardcodedAdmin } from '@/lib/admin-emails';
import { resolvePlan } from '@/lib/auth/plan';
import type { RequesterPlan } from '@/lib/auth/requester-plan';

/** Resolve a native client's Supabase bearer token. Invalid tokens fail closed. */
export async function getBearerRequesterPlan(req: NextRequest): Promise<RequesterPlan | null> {
  const value = req.headers.get('authorization');
  if (!value?.startsWith('Bearer ')) return null;
  const token = value.slice(7).trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return 'anon';

  try {
    const client = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) return 'anon';
    const { data: profile, error: profileError } = await client.from('profiles')
      .select('role,plan,plan_expires_at,suspended').eq('id', user.id).maybeSingle();
    if (profileError || profile?.suspended === true) return 'anon';
    if (profile && isHardcodedAdmin(user.email)) return 'admin';
    return resolvePlan({
      role: profile?.role,
      dbPlan: profile?.plan,
      planExpiresAt: profile?.plan_expires_at,
    });
  } catch {
    return 'anon';
  }
}
