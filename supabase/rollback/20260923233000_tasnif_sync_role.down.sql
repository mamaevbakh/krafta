-- Rollback for 20260923233000_tasnif_sync_role.sql.
-- First make sure no sync_runs row has source 'nightly' (delete or relabel them), or the
-- restored check below fails.
-- Afterwards: delete from supabase_migrations.schema_migrations where version = '20260923233000';

alter table tasnif.sync_runs drop constraint sync_runs_source;
alter table tasnif.sync_runs add constraint sync_runs_source
  check (source in ('excel', 'excel_uz', 'packages_excel', 'inactive_excel', 'details_api'));

do $$
declare
  t record;
begin
  for t in select tablename from pg_policies where schemaname = 'tasnif' and policyname = 'tasnif_sync_all' loop
    execute format('drop policy tasnif_sync_all on tasnif.%I', t.tablename);
  end loop;
end
$$;

alter default privileges for role postgres in schema tasnif revoke all on tables from tasnif_sync;
alter default privileges for role postgres in schema tasnif revoke all on sequences from tasnif_sync;
alter default privileges for role postgres in schema tasnif revoke all on functions from tasnif_sync;
revoke all on all tables in schema tasnif from tasnif_sync;
revoke all on all sequences in schema tasnif from tasnif_sync;
revoke all on all functions in schema tasnif from tasnif_sync;
revoke usage on schema tasnif from tasnif_sync;
revoke usage on schema extensions from tasnif_sync;
drop role tasnif_sync;
