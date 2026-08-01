// supabase/functions/send-job-alerts/index.ts
//
// Cron-invoked job-alert sender. Authenticates the scheduler via
// PUSH_CRON_SECRET (Bearer). For each user with a registered device, it finds
// new roles (last 24h) that match THEIR skills / target role and sends a
// personalised push + writes an in-app inbox row (migration_v42 notifications).
// Users with no skills set still get a generic "new jobs" alert.
//
// Deploy + schedule:
//   supabase functions deploy send-job-alerts
//   supabase secrets set PUSH_CRON_SECRET=<random>
//   # schedule it (pg_cron / Supabase cron) with Authorization: Bearer <secret>
//
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically; runs with
// the service role (bypasses RLS to read tokens + write everyone's inbox rows).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

interface NewJob {
  id: string;
  title: string | null;
  skills: string[] | null;
  category: string | null;
}

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('PUSH_CRON_SECRET');
  // Fail closed: this function holds the service-role key. A missing secret
  // must disable the endpoint, never turn it into an unauthenticated sender.
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('forbidden', { status: 401 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // New, active jobs in the last 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: jobsData, error: jobsErr } = await supabase
    .from('jobs')
    .select('id,title,skills,category')
    .eq('is_active', true)
    .gte('posted_at', since)
    .order('posted_at', { ascending: false })
    .limit(200);
  if (jobsErr) return Response.json({ error: jobsErr.message }, { status: 500 });
  const newJobs = (jobsData ?? []) as NewJob[];
  if (newJobs.length === 0) return Response.json({ sent: 0, reason: 'no new jobs' });

  // Devices, grouped by owner.
  const { data: tokenRows, error: tokErr } = await supabase.from('device_push_tokens').select('user_id, token');
  if (tokErr) return Response.json({ error: tokErr.message }, { status: 500 });
  const tokensByUser = new Map<string, string[]>();
  for (const r of (tokenRows ?? []) as { user_id: string; token: string }[]) {
    if (!r.user_id || !r.token) continue;
    const arr = tokensByUser.get(r.user_id) ?? [];
    arr.push(r.token);
    tokensByUser.set(r.user_id, arr);
  }
  const userIds = [...tokensByUser.keys()];
  if (userIds.length === 0) return Response.json({ sent: 0, reason: 'no devices' });

  // Those users' skills / target role (for matching).
  const { data: profs } = await supabase.from('profiles').select('id, skills, target_role').in('id', userIds);
  const profById = new Map<string, { skills: string[]; targetRole: string }>();
  for (const p of (profs ?? []) as { id: string; skills: string[] | null; target_role: string | null }[]) {
    profById.set(p.id, { skills: (p.skills ?? []).map((s) => s.toLowerCase()), targetRole: (p.target_role ?? '').toLowerCase() });
  }

  const total = newJobs.length;
  const notifications: Record<string, unknown>[] = [];
  const messages: Record<string, unknown>[] = [];

  for (const uid of userIds) {
    const prof = profById.get(uid);
    const skillSet = new Set(prof?.skills ?? []);
    const role = prof?.targetRole ?? '';
    const personalised = skillSet.size > 0 || role.length > 0;

    let matched = newJobs;
    if (personalised) {
      matched = newJobs.filter((j) => {
        const overlap = (j.skills ?? []).some((s) => skillSet.has(String(s).toLowerCase()));
        const roleHit = role.length > 0 && String(j.title ?? '').toLowerCase().includes(role);
        return overlap || roleHit;
      });
      if (matched.length === 0) continue; // has preferences but nothing matched → don't spam
    }

    const n = matched.length;
    const top = matched[0];
    const title = personalised ? 'New roles match your skills' : 'New remote jobs for you';
    const body = personalised
      ? `${n} new role${n === 1 ? '' : 's'} match your skills. Tap to view.`
      : `${total} new verified role${total === 1 ? '' : 's'} just landed. Tap to view.`;

    notifications.push({ user_id: uid, type: 'job_alert', title, body, job_id: top.id });
    for (const tk of tokensByUser.get(uid) ?? []) {
      messages.push({ to: tk, title, body, data: { jobId: top.id }, sound: 'default' });
    }
  }

  if (notifications.length) await supabase.from('notifications').insert(notifications);

  // Expo accepts up to 100 messages per request.
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(chunk),
    });
    if (res.ok) sent += chunk.length;
  }

  return Response.json({ sent, notified: notifications.length, newJobs: total });
});
