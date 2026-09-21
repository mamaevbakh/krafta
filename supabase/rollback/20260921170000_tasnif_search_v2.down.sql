-- Rollback for 20260921170000_tasnif_search_v2.sql.
--
-- 1. Re-run supabase/migrations/20260917051500_tasnif_search.sql as a whole. Every
--    statement in it is create-or-replace or if-not-exists, so it restores the v1
--    search_text, refresh_search_documents, embedding_inputs and search.
-- 2. Then run this file.
-- 3. Then rebuild documents: pnpm --filter tasnif search:refresh
-- Afterwards: delete from supabase_migrations.schema_migrations where version = '20260921170000';

alter table tasnif.codes alter column kind set expression as (
  case
    when left(ikpu, 5) = '10202' then 'catering'
    when left(ikpu, 1) = '1' then 'service'
    else 'goods'
  end
);

drop index if exists tasnif.codes_barcode_key_idx;
drop function if exists tasnif.search_stem(text);
drop function if exists tasnif.strip_exclusions(text);
drop function if exists tasnif.kind_of(text);
