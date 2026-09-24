-- Rollback for 20260925100000_tasnif_catalog_pages.sql.
-- Afterwards: delete from supabase_migrations.schema_migrations where version = '20260925100000';

drop function if exists tasnif.sitemap_code_starts(integer);
drop index if exists tasnif.codes_active_sitemap_idx;
drop index if exists tasnif.codes_active_listing_idx;
