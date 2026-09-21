-- Rollback for 20260921183000_tasnif_refresh_in_chunks.sql.
--
-- 1. Run this file (drops the chunked functions).
-- 2. Re-run the refresh_search_documents(p_group text) definition from
--    supabase/migrations/20260921170000_tasnif_search_v2.sql (create or replace), and
--    restore apps/tasnif/scripts/refresh_search.py from git history.
-- Afterwards: delete from supabase_migrations.schema_migrations where version = '20260921183000';

drop function if exists tasnif.remove_stale_search_documents();
drop function if exists tasnif.refresh_search_codes(text, text);
drop function if exists tasnif.refresh_search_nodes(text);
