-- Rollback for 20260917051500_tasnif_search.sql.
-- Afterwards: delete from supabase_migrations.schema_migrations where version = '20260917051500';

drop function if exists tasnif.search(text, extensions.halfvec, integer);
drop view if exists tasnif.embedding_inputs;
drop function if exists tasnif.refresh_search_documents(text);
drop table if exists tasnif.search_documents;
drop function if exists tasnif.search_text(text);
