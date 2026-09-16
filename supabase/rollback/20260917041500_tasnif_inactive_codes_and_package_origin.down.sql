-- Rollback for 20260917041500_tasnif_inactive_codes_and_package_origin.sql.
-- Afterwards: delete from supabase_migrations.schema_migrations where version = '20260917041500';

drop table if exists tasnif.import_packages;
drop table if exists tasnif.inactive_codes;
alter table tasnif.packages drop constraint if exists packages_origin;
alter table tasnif.packages drop column if exists origin;
alter table tasnif.sync_runs drop constraint if exists sync_runs_source;
alter table tasnif.sync_runs add constraint sync_runs_source check (source in ('excel', 'details_api'));
