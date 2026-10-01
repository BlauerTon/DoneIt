// DoneIt Planner: sends due task reminders as Web Push notifications.
//
// Called every minute by pg_cron (see supabase/reminders_cron.sql). Each reminder is claimed in
// `reminder_deliveries` before sending, so overlapping runs never send it twice.
//
// Secrets (supabase secrets set --env-file supabase/functions/.env):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: contact), CRON_SECRET
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
//
// Deploy: supabase functions deploy send-reminders --no-verify-jwt
// (the cron caller authenticates with CRON_SECRET instead of a user JWT)

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const GRACE_MS = 15 * 60 * 1000; // matches the app: late reminders older than this are skipped

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}`);
  return value;
};

webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

interface DueTask {
  id: string;
  user_id: string;
  title: string;
  date: string;
  start_min: number;
  end_min: number;
  remind_before: number;
  remind_at: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const duration = (m: number) => (m < 60 ? `${m}m` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`);

/** Same wording and tag as the app's on-device scheduler, so the two never double up. */
function payload(t: DueTask) {
  const at = new Date(t.remind_at).getTime();
  const range = `${clock(t.start_min)} – ${clock(t.end_min)}`;
  return {
    title: t.title,
    body: t.remind_before ? `In ${duration(t.remind_before)} · ${range}` : `Starting now · ${range}`,
    tag: `reminder:${t.id}:${at}`,
    url: `#/day/${t.date}`,
    taskId: t.id,
    at,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${env('CRON_SECRET')}`) {
    return json({ error: 'unauthorized' }, 401);
  }

  const now = Date.now();
  const { data: due, error } = await admin
    .from('planner_tasks')
    .select('id, user_id, title, date, start_min, end_min, remind_before, remind_at')
    .eq('done', false)
    .eq('deleted', false)
    .not('remind_at', 'is', null)
    .lte('remind_at', new Date(now).toISOString())
    .gte('remind_at', new Date(now - GRACE_MS).toISOString())
    .limit(500);
  if (error) return json({ error: error.message }, 500);
  if (!due?.length) return json({ due: 0, sent: 0 });

  // Claim: only rows this run inserted come back, so each reminder is sent exactly once.
  const { data: claimed, error: claimError } = await admin
    .from('reminder_deliveries')
    .upsert(
      due.map((t) => ({ task_id: t.id, remind_at: t.remind_at })),
      { onConflict: 'task_id,remind_at', ignoreDuplicates: true },
    )
    .select('task_id');
  if (claimError) return json({ error: claimError.message }, 500);

  const claimedIds = new Set((claimed ?? []).map((c) => c.task_id as string));
  const tasks = (due as DueTask[]).filter((t) => claimedIds.has(t.id));
  if (!tasks.length) return json({ due: due.length, sent: 0 });

  const { data: subs, error: subError } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .in('user_id', [...new Set(tasks.map((t) => t.user_id))]);
  if (subError) return json({ error: subError.message }, 500);

  let sent = 0;
  const expired: string[] = [];
  await Promise.all(
    tasks.flatMap((task) =>
      (subs ?? [])
        .filter((s) => s.user_id === task.user_id)
        .map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify(payload(task)),
              { TTL: Math.round(GRACE_MS / 1000), urgency: 'high' },
            );
            sent++;
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            // 404/410: the browser dropped this subscription (app uninstalled, permission revoked).
            if (status === 404 || status === 410) expired.push(s.endpoint);
            else console.error('push failed', status, (err as Error).message);
          }
        }),
    ),
  );

  if (expired.length) await admin.from('push_subscriptions').delete().in('endpoint', expired);
  return json({ due: due.length, claimed: tasks.length, sent, expired: expired.length });
});
