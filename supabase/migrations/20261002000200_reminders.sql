-- DoneIt Planner v2: reminders and push notifications.
--
-- Run after 20261002000000_planner_tasks.sql. Safe to run again. Contains no $$ blocks, so the
-- SQL editor cannot split it; still, paste the whole file and run it with nothing selected.
--
--   remind_before   minutes before the start time to remind (0 = at start), null = no reminder
--   remind_at       the absolute moment to remind, computed by the device in the user's time zone
--   push_subscriptions   one row per device that allowed notifications (Web Push endpoint + keys)
--   reminder_deliveries  which reminders the server already pushed, so each is sent only once

alter table public.planner_tasks
  add column if not exists remind_before smallint
    constraint planner_tasks_remind_before_range check (remind_before between 0 and 10080),
  add column if not exists remind_at timestamptz;

create index if not exists planner_tasks_remind_at_idx
  on public.planner_tasks (remind_at)
  where remind_at is not null and not done and not deleted;

create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- Registering goes through this function so a device that switches accounts moves its
-- subscription to the new user (a plain upsert would be blocked by the old owner's row).
create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language sql
security definer
set search_path = public
as '
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
  select p_endpoint, auth.uid(), p_p256dh, p_auth, p_user_agent
  where auth.uid() is not null
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        last_seen_at = now();
';

revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- Written only by the send-reminders Edge Function (service role). No client policies on purpose.
create table if not exists public.reminder_deliveries (
  task_id   uuid not null references public.planner_tasks (id) on delete cascade,
  remind_at timestamptz not null,
  sent_at   timestamptz not null default now(),
  primary key (task_id, remind_at)
);

alter table public.reminder_deliveries enable row level security;
