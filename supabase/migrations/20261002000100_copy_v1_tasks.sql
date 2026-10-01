-- DoneIt Planner v2: copy tasks from the v1 `public.tasks` table into `public.planner_tasks`.
--
-- Run after 20261002000000_planner_tasks.sql. Skip this file on a new project that never had v1.
--
-- This is one plain INSERT statement (no DO block, no helper function), so it cannot be split
-- apart by the SQL editor. It is safe to run again: ids are derived from the old bigint id, so
-- rows that were already copied are skipped. The v1 table is not modified.
--
-- Bad legacy values never abort the copy:
--   * dates that are not real calendar dates (e.g. 2026-02-30) become "unassigned"
--   * a start time with no end gets a one-hour slot
--   * times that are out of range or end before they start are dropped (task stays on its day)

insert into public.planner_tasks
  (id, user_id, title, color, date, start_min, end_min, done, created_at, client_updated_at)
select
  md5('doneit-legacy-' || legacy.id::text)::uuid,
  legacy.user_id,
  left(btrim(legacy.title), 500),
  case when legacy.color in ('blue', 'green', 'yellow', 'orange', 'purple', 'pink')
       then legacy.color else 'blue' end,
  legacy.d,
  case when legacy.time_ok then legacy.s end,
  case when legacy.time_ok then legacy.e end,
  coalesce(legacy.done, false),
  coalesce(legacy.created_at, now()),
  coalesce(legacy.created_at, now())
from (
  select
    p.*,
    (p.d is not null and p.s is not null and p.s < 1440 and p.e > p.s and p.e <= 1440) as time_ok
  from (
    select
      t.id,
      t.user_id,
      t.title,
      t.color,
      t.done,
      t.created_at,
      -- Real calendar dates only. Nested CASEs guarantee the cast runs after the format check.
      case when t.date::text ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
        case when to_char((substr(t.date::text, 1, 8) || '01')::date + (substr(t.date::text, 9, 2)::int - 1), 'YYYY-MM-DD') = t.date::text
             then (substr(t.date::text, 1, 8) || '01')::date + (substr(t.date::text, 9, 2)::int - 1)
        end
      end as d,
      case when t.start::text ~ '^([01]?[0-9]|2[0-4]):[0-5][0-9]'
           then split_part(t.start::text, ':', 1)::int * 60 + split_part(t.start::text, ':', 2)::int
      end as s,
      coalesce(
        case when t."end"::text ~ '^([01]?[0-9]|2[0-4]):[0-5][0-9]'
             then split_part(t."end"::text, ':', 1)::int * 60 + split_part(t."end"::text, ':', 2)::int
        end,
        case when t.start::text ~ '^([01]?[0-9]|2[0-4]):[0-5][0-9]'
             then least(split_part(t.start::text, ':', 1)::int * 60 + split_part(t.start::text, ':', 2)::int + 60, 1440)
        end
      ) as e
    from public.tasks t
    where t.user_id is not null
      and coalesce(btrim(t.title), '') <> ''
  ) p
) legacy
on conflict (id) do nothing;
