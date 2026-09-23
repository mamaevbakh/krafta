-- Rollback for 20260923213000_tasnif_search_no_full_scans.sql.
-- Afterwards: delete from supabase_migrations.schema_migrations where version = '20260923213000';

alter function tasnif.search(text, extensions.halfvec, integer) reset enable_seqscan;
