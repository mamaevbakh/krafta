-- tasnif: a database login for the nightly catalog sync that can reach schema
-- tasnif and nothing else.
--
-- WHY THIS EXISTS
-- ---------------
-- The nightly sync (apps/tasnif/scripts/sync_catalog.py) runs on GitHub. Until
-- now the scripts reached the database through the Supabase Management API with
-- a personal access token, which can manage every project on the account; a
-- leaked CI secret would have exposed Krafta's shops and payments along with the
-- catalog. The job now connects as `tasnif_sync`:
--
--   * read and write on the tables of schema tasnif, and nothing in public,
--     commerce, payments, auth or storage (no grants there, and PUBLIC holds none);
--   * execute on tasnif's functions (document rebuilds, search), usage on
--     schema extensions for the pgvector and pg_trgm types they use;
--   * an RLS policy per tasnif table for this role only. RLS is on everywhere in
--     tasnif with no policies, which service_role bypasses and any other role
--     would hit as "0 rows". A table added to tasnif later needs its own
--     `tasnif_sync_all` policy; default privileges cover grants, not policies;
--   * at most 3 connections, 15 minutes per statement.
--
-- The role is created WITHOUT a login. The founder turns it on with a password
-- they choose, so no credential passes through anyone else:
--
--   alter role tasnif_sync with login password '<long random password>';
--
-- and stores the connection string, through the pooler in session mode, as the
-- GitHub secret TASNIF_DATABASE_URL:
--
--   postgresql://tasnif_sync.hlmcoirjaydrfqcmnuun:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
--
-- Also: tasnif.sync_runs accepts source 'nightly' for the sync's own run record.
--
-- ADDITIVE AND REVERSIBLE
-- -----------------------
-- Touches schema tasnif, and creates one role. Rollback:
-- `supabase/rollback/20260923233000_tasnif_sync_role.down.sql`.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'tasnif_sync') then
    create role tasnif_sync nologin connection limit 3;
  end if;
end
$$;

alter role tasnif_sync set statement_timeout = '15min';
alter role tasnif_sync set idle_in_transaction_session_timeout = '5min';

grant usage on schema tasnif to tasnif_sync;
grant usage on schema extensions to tasnif_sync;
grant select, insert, update, delete on all tables in schema tasnif to tasnif_sync;
grant usage, select on all sequences in schema tasnif to tasnif_sync;
grant execute on all functions in schema tasnif to tasnif_sync;

-- Tables, sequences and functions added to tasnif later by migrations (run as postgres).
alter default privileges for role postgres in schema tasnif
  grant select, insert, update, delete on tables to tasnif_sync;
alter default privileges for role postgres in schema tasnif
  grant usage, select on sequences to tasnif_sync;
alter default privileges for role postgres in schema tasnif
  grant execute on functions to tasnif_sync;

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'tasnif' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists tasnif_sync_all on tasnif.%I', t.relname);
    execute format('create policy tasnif_sync_all on tasnif.%I for all to tasnif_sync using (true) with check (true)',
                   t.relname);
  end loop;
end
$$;

alter table tasnif.sync_runs drop constraint sync_runs_source;
alter table tasnif.sync_runs add constraint sync_runs_source
  check (source in ('excel', 'excel_uz', 'packages_excel', 'inactive_excel', 'details_api', 'nightly'));
