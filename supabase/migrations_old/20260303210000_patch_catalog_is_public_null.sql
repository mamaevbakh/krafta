-- ============================================================================
-- Migration: Patch catalog_is_public NULL handling
-- Date: 2026-03-03
-- Description: catalog_search_documents.catalog_id is nullable; ensure helper
-- function returns false for NULL to avoid edge-case policy behavior.
-- ============================================================================

create or replace function public.catalog_is_public(_catalog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select _catalog_id is not null
     and exists (
       select 1
       from public.catalogs c
       where c.id = _catalog_id
         and c.status = 'published'
     );
$$;
