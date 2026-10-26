-- Schedules the cleanup-storage Edge Function to delete queued Storage files.
--
-- Before this job can succeed, create these Vault secrets once per environment
-- (SQL editor), since secrets must not be committed in migrations:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service role key>', 'cleanup_service_key');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_cleanup_storage()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  project_url text;
  service_key text;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets where name = 'project_url';

  select decrypted_secret into service_key
  from vault.decrypted_secrets where name = 'cleanup_service_key';

  if project_url is null or service_key is null then
    raise warning 'cleanup-storage skipped: Vault secrets project_url / cleanup_service_key are not set';
    return;
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/cleanup-storage',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.invoke_cleanup_storage()
  from public, anon, authenticated;

-- Replace any existing schedule so the migration can be re-run safely.
do $$
begin
  perform cron.unschedule('cleanup-storage')
  where exists (select 1 from cron.job where jobname = 'cleanup-storage');
end;
$$;

select cron.schedule(
  'cleanup-storage',
  '*/10 * * * *',
  $$select public.invoke_cleanup_storage();$$
);
