-- DoneIt Planner: run the send-reminders Edge Function every minute.
--
-- Not a migration, because it needs a secret. Run once in the SQL editor AFTER deploying the
-- function (see README → Reminders). Replace <CRON_SECRET> with the CRON_SECRET value from
-- supabase/functions/.env. The secret is stored in Supabase Vault, not in this file.
--
-- To stop reminders later:  select cron.unschedule('doneit-send-reminders');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://oqdkkwchwyurvwpwtsft.supabase.co', 'doneit_project_url')
where not exists (select 1 from vault.secrets where name = 'doneit_project_url');

select vault.create_secret('<CRON_SECRET>', 'doneit_cron_secret')
where not exists (select 1 from vault.secrets where name = 'doneit_cron_secret');

select cron.schedule(
  'doneit-send-reminders',
  '* * * * *',
  'select net.http_post(
     url := (select decrypted_secret from vault.decrypted_secrets where name = ''doneit_project_url'') || ''/functions/v1/send-reminders'',
     headers := jsonb_build_object(
       ''Content-Type'', ''application/json'',
       ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''doneit_cron_secret'')
     ),
     body := ''{}''::jsonb,
     timeout_milliseconds := 10000
   )'
);
