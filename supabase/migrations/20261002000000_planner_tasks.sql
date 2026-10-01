-- DoneIt Planner v2: offline-first task storage.
--
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
-- Paste the WHOLE file and run it without selecting any text (a selection runs only that part).
-- It is safe to run again: every statement is idempotent, and on any error nothing is applied.
--
-- Design notes
--   * `id` is a client-generated UUID so tasks created offline have a permanent id immediately.
--   * Deletes are soft (`deleted = true`) so devices that were offline learn about them on next sync.
--   * `client_updated_at` is when the user made the change on their device. A trigger ignores
--     writes that are older than what the server already has (last-write-wins), so a phone that
--     comes back online with stale edits cannot overwrite newer edits made elsewhere.
--   * `updated_at` is stamped by the server and is what clients use as their pull cursor.
--   * Times are minutes from midnight on the task's local calendar day (0..1440). A planner day is
--     a wall-clock concept, so a 09:00 task stays at 09:00 when you travel.

create table if not exists public.planner_tasks (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 500),
  notes             text not null default '' check (char_length(notes) <= 5000),
  color             text not null default 'blue'
                    check (color in ('blue', 'green', 'yellow', 'orange', 'purple', 'pink')),
  date              date,
  start_min         smallint check (start_min between 0 and 1439),
  end_min           smallint check (end_min between 1 and 1440),
  done              boolean not null default false,
  deleted           boolean not null default false,
  created_at        timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint planner_tasks_time_pair  check ((start_min is null) = (end_min is null)),
  constraint planner_tasks_time_order check (start_min is null or end_min > start_min),
  constraint planner_tasks_time_date  check (start_min is null or date is not null)
);

create index if not exists planner_tasks_user_updated_idx
  on public.planner_tasks (user_id, updated_at);

-- Server-side stamping + last-write-wins guard.
create or replace function public.planner_tasks_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    -- Ignore stale writes from devices that were offline longer than the latest edit.
    if new.client_updated_at < old.client_updated_at then
      return null;
    end if;
    new.created_at := old.created_at;
    new.user_id := old.user_id;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists planner_tasks_before_write on public.planner_tasks;
create trigger planner_tasks_before_write
  before insert or update on public.planner_tasks
  for each row execute function public.planner_tasks_before_write();

-- Row Level Security: users can only ever see and change their own rows.
alter table public.planner_tasks enable row level security;

drop policy if exists "planner_tasks_select_own" on public.planner_tasks;
create policy "planner_tasks_select_own" on public.planner_tasks
  for select using (auth.uid() = user_id);

drop policy if exists "planner_tasks_insert_own" on public.planner_tasks;
create policy "planner_tasks_insert_own" on public.planner_tasks
  for insert with check (auth.uid() = user_id);

drop policy if exists "planner_tasks_update_own" on public.planner_tasks;
create policy "planner_tasks_update_own" on public.planner_tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "planner_tasks_delete_own" on public.planner_tasks;
create policy "planner_tasks_delete_own" on public.planner_tasks
  for delete using (auth.uid() = user_id);

-- Realtime: push changes to the user's other open devices.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planner_tasks'
  ) then
    alter publication supabase_realtime add table public.planner_tasks;
  end if;
end;
$$;

-- Existing v1 tasks are copied by the next migration (20261002000100_copy_v1_tasks.sql).
