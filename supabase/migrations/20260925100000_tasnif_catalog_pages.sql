-- tasnif: indexes and one function for the public catalog pages and the sitemaps.
--
-- WHY THIS EXISTS
-- ---------------
-- tasnif.krafta.uz becomes findable in Google and Yandex: every category gets a page
-- (group › class › position › sub-position, each listing what is under it) and
-- sitemaps list all 441,547 active codes. Two of the reads that needs had no index,
-- and both were measured on kraftabase (Micro) on 2026-09-25:
--
-- 1. A sub-position's codes, unbranded first, 100 per page. The largest sub-position,
--    06810006002, holds 68,674 codes, and its last page sorted all of them on disk
--    (0.9 s, 16 MB of temp files). codes_active_listing_idx keeps them in page
--    order, so a page's codes come off the index alone however deep it is.
-- 2. Every active code in code order, for the sitemaps. Skipping to the 425,000th
--    code through the primary key read the table from disk row by row (25.7 s),
--    because only the row knows whether a code is active. codes_active_sitemap_idx
--    holds each active code and when it last changed, so the sitemaps never read
--    the table.
--
-- tasnif.sitemap_code_starts(n) returns the first code of every n-code sitemap
-- file. Each file then reads its own slice by code range, without the offset that
-- made (2) slow.
--
-- ADDITIVE AND REVERSIBLE
-- -----------------------
-- Two indexes and a read-only function; nothing existing changes. The indexes block
-- writes to tasnif.codes for the seconds they take to build (reads carry on), so
-- this is applied outside the daily sync (09:30 Tashkent).
-- Rollback: supabase/rollback/20260925100000_tasnif_catalog_pages.down.sql

create index if not exists codes_active_listing_idx
  on tasnif.codes (subposition_code, is_branded, ikpu)
  where status = 'active';

create index if not exists codes_active_sitemap_idx
  on tasnif.codes (ikpu) include (updated_at)
  where status = 'active';

create or replace function tasnif.sitemap_code_starts(p_size integer)
returns table (ikpu text)
language sql
stable
set search_path = ''
as $$
  select ordered.ikpu
  from (
    select c.ikpu, row_number() over (order by c.ikpu) - 1 as position
    from tasnif.codes c
    where c.status = 'active'
  ) ordered
  where ordered.position % greatest(p_size, 1) = 0
  order by ordered.ikpu
$$;

revoke all on function tasnif.sitemap_code_starts(integer) from public, anon, authenticated;
grant execute on function tasnif.sitemap_code_starts(integer) to service_role;
