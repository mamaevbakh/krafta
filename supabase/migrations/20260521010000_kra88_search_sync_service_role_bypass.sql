-- KRA-88 — let service-role contexts UPDATE items without tripping the
-- catalog_search_sync trigger's auth check.
--
-- ## Background
--
-- `public.catalog_search_sync_item_document(p_item_id uuid)` is a
-- SECURITY DEFINER function fired by the BEFORE UPDATE trigger
-- `trg_catalog_search_sync_item` on public.items. Its body has a guard:
--
--     if not public.is_org_role(v_item.org_id, array['owner','admin']) then
--       raise exception 'not authorized' using errcode = '42501';
--     end if;
--
-- That guard prevents direct RPC misuse from anon/non-admin sessions —
-- which is the right policy for user-initiated calls.
--
-- But it also fires for SERVICE-ROLE writes:
--   * `auth.uid()` is NULL in service-role context
--   * `is_org_role(...)` returns false
--   * trigger raises and rolls the UPDATE back
--
-- The /api/items/media POST route uses service role (needs Storage admin)
-- and UPDATEs items.image_path after registering a new photo. Without
-- this fix the UPDATE silently fails (route didn't check `.update().error`)
-- so item_media gets the row + Storage gets the file but items.image_path
-- stays NULL. Dashboard thumbnails read from items.image_path → broken
-- icon until you re-upload (which would also fail for the same reason).
--
-- ## Fix
--
-- Make the guard skip when there is NO authenticated user. The only
-- callers without an `auth.uid()` are:
--   1. Service-role API routes (Krafta-managed, trusted).
--   2. DB-internal triggers from service-role writes (same trust).
--   3. Migrations / superuser psql (trusted by definition).
--
-- The org-role check still fires for any anon/authenticated user, which
-- is the original intent of the "prevent direct RPC misuse" comment.
--
-- ## Backfill
--
-- After the function is fixed, backfill the items that have media rows
-- but lost their image_path. This covers:
--   * The Triomphe Lola item the merchant reported.
--   * Any future merchant who uploaded between the broken state shipping
--     and this fix landing.
-- Pick the primary media row's storage_path; if none is flagged primary,
-- fall back to the lowest-position row (server route does the same).

CREATE OR REPLACE FUNCTION public.catalog_search_sync_item_document(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_item record;
begin
  select
    i.id,
    i.catalog_id,
    i.category_id,
    i.name,
    i.slug,
    i.description,
    c.name as category_name,
    c.slug as category_slug,
    cat.org_id
  into v_item
  from public.items i
  join public.catalogs cat on cat.id = i.catalog_id
  left join public.catalog_categories c on c.id = i.category_id
  where i.id = p_item_id;

  if not found then
    return;
  end if;

  -- Prevent direct RPC misuse from anon/non-admin sessions. Skip the
  -- check when there's no authenticated user — that's service-role /
  -- trigger / migration context, all trusted by construction.
  if (select auth.uid()) is not null
     and not public.is_org_role(v_item.org_id, array['owner','admin']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.catalog_search_documents
  where source_table = 'items'
    and source_id::text = v_item.id::text;

  insert into public.catalog_search_documents (
    catalog_id,
    org_id,
    source_table,
    source_id,
    locale,
    title,
    subtitle,
    description,
    tags
  )
  values (
    v_item.catalog_id,
    v_item.org_id,
    'items',
    v_item.id,
    null,
    v_item.name,
    coalesce(v_item.category_name, v_item.category_slug, v_item.slug),
    v_item.description,
    array['item']::text[]
  );

  delete from public.catalog_search_documents d
  where d.source_table = 'item_translations'
    and d.source_id::text in (
      select t.id::text
      from public.item_translations t
      where t.item_id = v_item.id
    );

  insert into public.catalog_search_documents (
    catalog_id,
    org_id,
    source_table,
    source_id,
    locale,
    title,
    subtitle,
    description,
    tags
  )
  select
    v_item.catalog_id,
    v_item.org_id,
    'item_translations',
    t.id,
    t.locale,
    t.name,
    coalesce(v_item.category_name, v_item.category_slug, v_item.slug),
    coalesce(t.description, v_item.description),
    array['item', 'translation']::text[]
  from public.item_translations t
  where t.item_id = v_item.id;
end;
$function$;

-- Backfill items whose media row exists but image_path was lost during
-- the dev-cleanup race (or any future cases). Idempotent — items that
-- already have a matching image_path are untouched. Uses lateral join
-- to pick the merchant's chosen primary, falling back to lowest-position
-- when nothing is flagged primary (same heuristic as the server route).
UPDATE public.items i
SET image_path = chosen.storage_path,
    image_alt  = chosen.alt
FROM (
  SELECT DISTINCT ON (m.item_id)
    m.item_id,
    m.storage_path,
    m.alt
  FROM public.item_media m
  ORDER BY m.item_id,
           m.is_primary DESC,
           m.position ASC,
           m.created_at ASC
) AS chosen
WHERE i.id = chosen.item_id
  AND i.image_path IS NULL;
