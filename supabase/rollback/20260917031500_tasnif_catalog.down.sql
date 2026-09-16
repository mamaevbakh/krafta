-- Rollback for 20260917031500_tasnif_catalog.sql.
--
-- Safe to run at any time: schema `tasnif` holds only the public IKPU catalog
-- copy, and nothing outside it references any object inside it. Afterwards,
-- delete the migration-history row so a later `supabase db push` re-applies
-- the migration instead of believing it is still there:
--   delete from supabase_migrations.schema_migrations where version = '20260917031500';

drop schema if exists tasnif cascade;
