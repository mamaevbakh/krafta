-- Rollback for 20260923194000_tasnif_search_v3.sql.
--
-- 1. Re-run the search_stem and search definitions from
--    supabase/migrations/20260921170000_tasnif_search_v2.sql (both are create or replace, so
--    only those two statements, then that file's revoke/grant lines for them). Do this first:
--    the v3 search calls query_terms, so dropping it before search is replaced breaks the site.
-- 2. Run this file.
-- No document rebuild is needed: v3 does not change how documents are written.
-- Afterwards: delete from supabase_migrations.schema_migrations where version = '20260923194000';

drop function if exists tasnif.query_terms(text);
drop index if exists tasnif.search_documents_category_tsv_idx;
drop index if exists tasnif.search_documents_generic_key_idx;
