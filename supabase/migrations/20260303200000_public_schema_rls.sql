-- ============================================================================
-- Migration: Public Schema RLS
-- Date: 2026-03-01
-- Description: Enable Row Level Security on all public-schema tables with
--   role-based access control (owner > admin > member) and public read
--   scoped to published/active content.
-- ============================================================================

-- ============================================================================
-- 0. Prerequisites: catalog_status enum + catalogs.status column
-- ============================================================================

-- Status enum: draft (org-only), published (public), suspended (Krafta staff only)
create type public.catalog_status as enum ('draft', 'published', 'suspended');

alter table public.catalogs
  add column status public.catalog_status not null default 'draft';

-- All existing catalogs are live → mark as published
update public.catalogs set status = 'published';

-- ============================================================================
-- 1. Helper functions (SECURITY DEFINER, immutable search_path)
-- ============================================================================

-- Check if current user is a member of the given org with one of the allowed roles
create or replace function public.is_org_role(
  _org_id uuid,
  _roles text[] default array['owner','admin','member']
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.org_id   = _org_id
      and m.user_id  = auth.uid()
      and m.role::text = any(_roles)
  );
$$;

-- Check if a catalog is publicly visible
create or replace function public.catalog_is_public(_catalog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.catalogs c
    where c.id     = _catalog_id
      and c.status = 'published'
  );
$$;

-- Resolve org_id for a catalog
create or replace function public.catalog_org_id(_catalog_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.org_id from public.catalogs c where c.id = _catalog_id;
$$;

-- ============================================================================
-- 2. Drop ALL existing policies (clean slate)
-- ============================================================================

-- public schema
drop policy if exists "Enable read access for all users" on public.catalogs;
drop policy if exists "Enable read access for all users" on public.catalog_categories;
drop policy if exists "Enable read access for all users" on public.items;
drop policy if exists "Enable read access for all users" on public.organizations;
drop policy if exists "Enable read access for all users" on public.organization_members;
drop policy if exists "catalog_item_type_feature_requests_insert_self" on public.catalog_item_type_feature_requests;
drop policy if exists "catalog_item_type_feature_requests_select_org_members" on public.catalog_item_type_feature_requests;

-- ============================================================================
-- 3. Enable RLS on all public tables
-- ============================================================================

alter table public.organizations                      enable row level security;
alter table public.organization_members               enable row level security;
alter table public.catalogs                           enable row level security;
alter table public.catalog_categories                 enable row level security;
alter table public.items                              enable row level security;
alter table public.item_media                         enable row level security;
alter table public.catalog_locales                    enable row level security;
alter table public.catalog_category_translations      enable row level security;
alter table public.item_translations                  enable row level security;
alter table public.catalog_search_documents           enable row level security;
alter table public.search_synonyms                    enable row level security;
alter table public.search_logs                        enable row level security;
-- catalog_item_type_feature_requests already has RLS enabled

-- ============================================================================
-- 4. organizations
--    SELECT  → org members only (no public org page)
--    INSERT  → service_role only (bypasses RLS; no policy needed)
--    UPDATE  → owner only
--    DELETE  → nobody
-- ============================================================================

create policy "org_select_members"
  on public.organizations for select
  to authenticated
  using (
    public.is_org_role(id, array['owner','admin','member'])
  );

create policy "org_update_owner"
  on public.organizations for update
  to authenticated
  using (
    public.is_org_role(id, array['owner'])
  )
  with check (
    public.is_org_role(id, array['owner'])
  );

-- No INSERT policy: org creation is server-side (service_role bypasses RLS)
-- No DELETE policy: orgs are never deleted

-- ============================================================================
-- 5. organization_members
--    SELECT → org members can see their own org's members
--    INSERT → owner, admin can invite
--    UPDATE → owner only (change roles)
--    DELETE → owner only (remove members)
-- ============================================================================

create policy "orgmembers_select"
  on public.organization_members for select
  to authenticated
  using (
    public.is_org_role(org_id, array['owner','admin','member'])
  );

create policy "orgmembers_insert"
  on public.organization_members for insert
  to authenticated
  with check (
    public.is_org_role(org_id, array['owner','admin'])
  );

create policy "orgmembers_update_owner"
  on public.organization_members for update
  to authenticated
  using (
    public.is_org_role(org_id, array['owner'])
  )
  with check (
    -- Prevent moving member to another org
    public.is_org_role(org_id, array['owner'])
  );

create policy "orgmembers_delete_owner"
  on public.organization_members for delete
  to authenticated
  using (
    public.is_org_role(org_id, array['owner'])
  );

-- ============================================================================
-- 6. catalogs
--    SELECT (anon) → published only
--    SELECT (authenticated) → published + own org's drafts
--    INSERT → owner, admin
--    UPDATE → owner, admin (cannot set status to 'suspended')
--    DELETE → nobody (soft delete via status or future is_active)
-- ============================================================================

create policy "catalogs_select_anon"
  on public.catalogs for select
  to anon
  using (
    status = 'published'
  );

create policy "catalogs_select_authed"
  on public.catalogs for select
  to authenticated
  using (
    status = 'published'
    or public.is_org_role(org_id, array['owner','admin','member'])
  );

create policy "catalogs_insert"
  on public.catalogs for insert
  to authenticated
  with check (
    public.is_org_role(org_id, array['owner','admin'])
  );

create policy "catalogs_update"
  on public.catalogs for update
  to authenticated
  using (
    public.is_org_role(org_id, array['owner','admin'])
  )
  with check (
    -- Must remain in same org
    public.is_org_role(org_id, array['owner','admin'])
    -- Cannot set status to 'suspended' (Krafta staff only via service_role)
    and status in ('draft', 'published')
  );

-- No DELETE policy: catalogs are soft-deleted (status → 'draft' or service_role sets 'suspended')

-- ============================================================================
-- 7. catalog_categories
--    SELECT (anon) → only if parent catalog is published AND category is active
--    SELECT (authenticated) → published catalog active + own org's catalog members see all
--    INSERT → owner, admin (of catalog's org)
--    UPDATE → owner, admin (of catalog's org)
--    DELETE → nobody (soft delete via is_active)
-- ============================================================================

create policy "categories_select_anon"
  on public.catalog_categories for select
  to anon
  using (
    is_active = true
    and public.catalog_is_public(catalog_id)
  );

create policy "categories_select_authed"
  on public.catalog_categories for select
  to authenticated
  using (
    (is_active = true and public.catalog_is_public(catalog_id))
    or public.is_org_role(public.catalog_org_id(catalog_id), array['owner','admin','member'])
  );

create policy "categories_insert"
  on public.catalog_categories for insert
  to authenticated
  with check (
    public.is_org_role(public.catalog_org_id(catalog_id), array['owner','admin'])
  );

create policy "categories_update"
  on public.catalog_categories for update
  to authenticated
  using (
    public.is_org_role(public.catalog_org_id(catalog_id), array['owner','admin'])
  )
  with check (
    -- Cannot move category to a catalog in another org
    public.is_org_role(public.catalog_org_id(catalog_id), array['owner','admin'])
  );

-- No DELETE policy: soft delete via is_active = false

-- ============================================================================
-- 8. items
--    SELECT (anon) → active items in published catalogs
--    SELECT (authenticated) → same + org members see all
--    INSERT → owner, admin
--    UPDATE → owner, admin
--    DELETE → nobody (soft delete via is_active)
-- ============================================================================

create policy "items_select_anon"
  on public.items for select
  to anon
  using (
    is_active = true
    and public.catalog_is_public(catalog_id)
  );

create policy "items_select_authed"
  on public.items for select
  to authenticated
  using (
    (is_active = true and public.catalog_is_public(catalog_id))
    or public.is_org_role(public.catalog_org_id(catalog_id), array['owner','admin','member'])
  );

create policy "items_insert"
  on public.items for insert
  to authenticated
  with check (
    public.is_org_role(public.catalog_org_id(catalog_id), array['owner','admin'])
  );

create policy "items_update"
  on public.items for update
  to authenticated
  using (
    public.is_org_role(public.catalog_org_id(catalog_id), array['owner','admin'])
  )
  with check (
    -- Cannot move item to a catalog in another org
    public.is_org_role(public.catalog_org_id(catalog_id), array['owner','admin'])
  );

-- No DELETE policy: soft delete via is_active = false

-- ============================================================================
-- 9. item_media
--    Chain: item_media → items → catalogs → org
--    SELECT (anon) → only if parent item is active and catalog is published
--    SELECT (authenticated) → same + org members see all
--    INSERT/UPDATE/DELETE → owner, admin
-- ============================================================================

create policy "item_media_select_anon"
  on public.item_media for select
  to anon
  using (
    exists (
      select 1
      from public.items i
      where i.id = item_media.item_id
        and i.is_active = true
        and public.catalog_is_public(i.catalog_id)
    )
  );

create policy "item_media_select_authed"
  on public.item_media for select
  to authenticated
  using (
    exists (
      select 1
      from public.items i
      where i.id = item_media.item_id
        and (
          (i.is_active = true and public.catalog_is_public(i.catalog_id))
          or public.is_org_role(public.catalog_org_id(i.catalog_id), array['owner','admin','member'])
        )
    )
  );

create policy "item_media_insert"
  on public.item_media for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.items i
      where i.id = item_media.item_id
        and public.is_org_role(public.catalog_org_id(i.catalog_id), array['owner','admin'])
    )
  );

create policy "item_media_update"
  on public.item_media for update
  to authenticated
  using (
    exists (
      select 1
      from public.items i
      where i.id = item_media.item_id
        and public.is_org_role(public.catalog_org_id(i.catalog_id), array['owner','admin'])
    )
  )
  with check (
    -- Cannot move media to an item in another org
    exists (
      select 1
      from public.items i
      where i.id = item_media.item_id
        and public.is_org_role(public.catalog_org_id(i.catalog_id), array['owner','admin'])
    )
  );

create policy "item_media_delete"
  on public.item_media for delete
  to authenticated
  using (
    exists (
      select 1
      from public.items i
      where i.id = item_media.item_id
        and public.is_org_role(public.catalog_org_id(i.catalog_id), array['owner','admin'])
    )
  );

-- ============================================================================
-- 10. catalog_locales
--     Chain: catalog_locales → catalogs → org
--     SELECT (anon) → published catalogs only
--     SELECT (authenticated) → same + org members
--     INSERT/UPDATE/DELETE → owner, admin
-- ============================================================================

create policy "catalog_locales_select_anon"
  on public.catalog_locales for select
  to anon
  using (
    public.catalog_is_public(catalog_id)
  );

create policy "catalog_locales_select_authed"
  on public.catalog_locales for select
  to authenticated
  using (
    public.catalog_is_public(catalog_id)
    or public.is_org_role(public.catalog_org_id(catalog_id), array['owner','admin','member'])
  );

create policy "catalog_locales_insert"
  on public.catalog_locales for insert
  to authenticated
  with check (
    public.is_org_role(public.catalog_org_id(catalog_id), array['owner','admin'])
  );

create policy "catalog_locales_update"
  on public.catalog_locales for update
  to authenticated
  using (
    public.is_org_role(public.catalog_org_id(catalog_id), array['owner','admin'])
  )
  with check (
    public.is_org_role(public.catalog_org_id(catalog_id), array['owner','admin'])
  );

create policy "catalog_locales_delete"
  on public.catalog_locales for delete
  to authenticated
  using (
    public.is_org_role(public.catalog_org_id(catalog_id), array['owner','admin'])
  );

-- ============================================================================
-- 11. catalog_category_translations
--     Chain: translations → catalog_categories → catalogs → org
--     SELECT (anon) → published catalog + active category
--     SELECT (authenticated) → same + org members
--     INSERT/UPDATE/DELETE → owner, admin
-- ============================================================================

create policy "cat_translations_select_anon"
  on public.catalog_category_translations for select
  to anon
  using (
    exists (
      select 1
      from public.catalog_categories cc
      where cc.id = catalog_category_translations.category_id
        and cc.is_active = true
        and public.catalog_is_public(cc.catalog_id)
    )
  );

create policy "cat_translations_select_authed"
  on public.catalog_category_translations for select
  to authenticated
  using (
    exists (
      select 1
      from public.catalog_categories cc
      where cc.id = catalog_category_translations.category_id
        and (
          (cc.is_active = true and public.catalog_is_public(cc.catalog_id))
          or public.is_org_role(public.catalog_org_id(cc.catalog_id), array['owner','admin','member'])
        )
    )
  );

create policy "cat_translations_insert"
  on public.catalog_category_translations for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.catalog_categories cc
      where cc.id = catalog_category_translations.category_id
        and public.is_org_role(public.catalog_org_id(cc.catalog_id), array['owner','admin'])
    )
  );

create policy "cat_translations_update"
  on public.catalog_category_translations for update
  to authenticated
  using (
    exists (
      select 1
      from public.catalog_categories cc
      where cc.id = catalog_category_translations.category_id
        and public.is_org_role(public.catalog_org_id(cc.catalog_id), array['owner','admin'])
    )
  )
  with check (
    exists (
      select 1
      from public.catalog_categories cc
      where cc.id = catalog_category_translations.category_id
        and public.is_org_role(public.catalog_org_id(cc.catalog_id), array['owner','admin'])
    )
  );

create policy "cat_translations_delete"
  on public.catalog_category_translations for delete
  to authenticated
  using (
    exists (
      select 1
      from public.catalog_categories cc
      where cc.id = catalog_category_translations.category_id
        and public.is_org_role(public.catalog_org_id(cc.catalog_id), array['owner','admin'])
    )
  );

-- ============================================================================
-- 12. item_translations
--     Chain: translations → items → catalogs → org
--     SELECT (anon) → published catalog + active item
--     SELECT (authenticated) → same + org members
--     INSERT/UPDATE/DELETE → owner, admin
-- ============================================================================

create policy "item_translations_select_anon"
  on public.item_translations for select
  to anon
  using (
    exists (
      select 1
      from public.items i
      where i.id = item_translations.item_id
        and i.is_active = true
        and public.catalog_is_public(i.catalog_id)
    )
  );

create policy "item_translations_select_authed"
  on public.item_translations for select
  to authenticated
  using (
    exists (
      select 1
      from public.items i
      where i.id = item_translations.item_id
        and (
          (i.is_active = true and public.catalog_is_public(i.catalog_id))
          or public.is_org_role(public.catalog_org_id(i.catalog_id), array['owner','admin','member'])
        )
    )
  );

create policy "item_translations_insert"
  on public.item_translations for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.items i
      where i.id = item_translations.item_id
        and public.is_org_role(public.catalog_org_id(i.catalog_id), array['owner','admin'])
    )
  );

create policy "item_translations_update"
  on public.item_translations for update
  to authenticated
  using (
    exists (
      select 1
      from public.items i
      where i.id = item_translations.item_id
        and public.is_org_role(public.catalog_org_id(i.catalog_id), array['owner','admin'])
    )
  )
  with check (
    exists (
      select 1
      from public.items i
      where i.id = item_translations.item_id
        and public.is_org_role(public.catalog_org_id(i.catalog_id), array['owner','admin'])
    )
  );

create policy "item_translations_delete"
  on public.item_translations for delete
  to authenticated
  using (
    exists (
      select 1
      from public.items i
      where i.id = item_translations.item_id
        and public.is_org_role(public.catalog_org_id(i.catalog_id), array['owner','admin'])
    )
  );

-- ============================================================================
-- 13. catalog_search_documents
--     SELECT (anon) → published catalogs only (used by search RPCs)
--     SELECT (authenticated) → same + org members
--     INSERT/UPDATE/DELETE → no client policies (triggers run as owner,
--       service_role bypasses RLS)
-- ============================================================================

create policy "search_docs_select_anon"
  on public.catalog_search_documents for select
  to anon
  using (
    public.catalog_is_public(catalog_id)
  );

create policy "search_docs_select_authed"
  on public.catalog_search_documents for select
  to authenticated
  using (
    public.catalog_is_public(catalog_id)
    or public.is_org_role(org_id, array['owner','admin','member'])
  );

-- No INSERT/UPDATE/DELETE policies: managed by triggers (run as table owner)
-- and server-side service_role which bypasses RLS.

-- ============================================================================
-- 14. search_synonyms
--     Internal Krafta data. RLS enabled, no client policies.
--     Accessed only via server-side / search functions.
-- ============================================================================

-- No policies: anon/authenticated cannot read or write.
-- service_role bypasses RLS for management.
-- Note: catalog_search functions read search_synonyms via search_expand_query().
-- We upgrade search_expand_query + search_simple_translit to SECURITY DEFINER
-- so anon search still works even though search_synonyms has no client policies.

alter function public.search_expand_query(text) security definer;
alter function public.search_expand_query(text) set search_path = '';
alter function public.search_simple_translit(text) security definer;
alter function public.search_simple_translit(text) set search_path = '';

-- ============================================================================
-- 15. search_logs
--     Internal Krafta analytics. RLS enabled, no client policies.
--     Written by log_search() which is already SECURITY DEFINER.
-- ============================================================================

-- No policies: anon/authenticated cannot read or write directly.
-- log_search() is SECURITY DEFINER and handles inserts.
-- service_role bypasses RLS for analytics queries.

-- ============================================================================
-- 16. catalog_item_type_feature_requests
--     Already has RLS enabled. Re-create policies with proper patterns.
-- ============================================================================

create policy "feature_req_select_org"
  on public.catalog_item_type_feature_requests for select
  to authenticated
  using (
    public.is_org_role(org_id, array['owner','admin','member'])
  );

create policy "feature_req_insert_self"
  on public.catalog_item_type_feature_requests for insert
  to authenticated
  with check (
    requested_by_user_id = auth.uid()
    and public.is_org_role(org_id, array['owner','admin','member'])
  );

-- ============================================================================
-- 17. Fix search_normalize to SECURITY DEFINER (used by search_expand_query)
-- ============================================================================

alter function public.search_normalize(text) security definer;
alter function public.search_normalize(text) set search_path = '';

-- ============================================================================
-- Done. Summary of what this migration does:
--
-- Schema changes:
--   - Added catalog_status enum (draft, published, suspended)
--   - Added catalogs.status column (default 'draft', existing rows → 'published')
--
-- Helper functions:
--   - is_org_role(org_id, roles[]) → boolean
--   - catalog_is_public(catalog_id) → boolean
--   - catalog_org_id(catalog_id) → uuid
--   - search_expand_query → upgraded to SECURITY DEFINER
--   - search_normalize → upgraded to SECURITY DEFINER
--
-- RLS enabled on 12 tables (was already on catalog_item_type_feature_requests):
--   organizations, organization_members, catalogs, catalog_categories,
--   items, item_media, catalog_locales, catalog_category_translations,
--   item_translations, catalog_search_documents, search_synonyms, search_logs
--
-- Access model:
--   - Anon SELECT: only published catalogs + active entities
--   - Authenticated SELECT: published + own org's content
--   - Writes (INSERT/UPDATE): owner & admin via org membership chain
--   - No DELETE on catalogs, categories, items (soft delete only)
--   - DELETE allowed on media, locales, translations
--   - search_synonyms & search_logs: no client policies (internal)
--   - 'suspended' status only settable by service_role
-- ============================================================================
