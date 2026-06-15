// supabase/functions/send-job-alerts/index.ts
//
// Sends "new remote jobs" push notifications to mobile devices via Expo's push
// API. Pairs with the mobile client (mobile/src/lib/push.ts) which registers
// tokens into public.device_push_tokens.
//
// Deploy + schedule:
//   supabase functions deploy send-job-alerts
//   supabase secrets set PUSH_CRON_SECRET=<random>
//   # then schedule it (pg_cron / Supabase scheduled function), calling with
//   #   Authorization: Bearer <PUSH_CRON_SECRET>
//
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// This runs with the service role, so it bypasses RLS to read every token.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req: Request) => {
  // Auth: only an authorised scheduler may trigger sends.
  const secret = Deno.env.get('PUSH_CRON_SECRET');
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('forbidden', { status: 401 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // New jobs in the last 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: jobs, error: jobsErr } = await supabase
    .from('jobs')
    .select('id')
    .eq('is_active', true)
    .gte('posted_at', since)
    .order('posted_at', { ascending: false })
    .limit(50);
  if (jobsErr) return Response.json({ error: jobsErr.message }, { status: 500 });

  const newCount = jobs?.length ?? 0;
  if (newCount === 0) return Response.json({ sent: 0, reason: 'no new jobs' });
  const topJobId = jobs![0].id as string;

  // All registered device tokens (with their owner for the in-app inbox).
  const { data: tokens, error: tokErr } = await supabase.from('device_push_tokens').select('user_id, token');
  if (tokErr) return Response.json({ error: tokErr.message }, { status: 500 });

  const body = `${newCount} new verified role${newCount === 1 ? '' : 's'} just landed. Tap to view.`;

  // Mirror the alert into each user's in-app inbox (migration_v42 notifications).
  const userIds = [...new Set((tokens ?? []).map((t: { user_id: string }) => t.user_id).filter(Boolean))];
  if (userIds.length) {
    await supabase.from('notifications').insert(
      userIds.map((uid) => ({ user_id: uid, type: 'job_alert', title: 'New remote jobs for you', body, job_id: topJobId })),
    );
  }

  const messages = (tokens ?? []).map((t: { token: string }) => ({
    to: t.token,
    title: 'New remote jobs for you',
    body,
    data: { jobId: topJobId },
    sound: 'default',
  }));

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

  return Response.json({ sent, devices: messages.length, newJobs: newCount });
});
