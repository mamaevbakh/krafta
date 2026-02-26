-- Track demand for currently unsupported item product types in the dashboard.
-- One request counts once per user per org/catalog/product_type combination.

create table if not exists public.catalog_item_type_feature_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  requested_by_user_id uuid not null,
  product_type public.catalog_item_product_type not null,
  source text not null default 'create_item_type_modal',
  created_at timestamptz not null default now()
);

create unique index if not exists catalog_item_type_feature_requests_unique
  on public.catalog_item_type_feature_requests(org_id, catalog_id, requested_by_user_id, product_type);

create index if not exists catalog_item_type_feature_requests_catalog_type_idx
  on public.catalog_item_type_feature_requests(catalog_id, product_type, created_at desc);

create index if not exists catalog_item_type_feature_requests_type_idx
  on public.catalog_item_type_feature_requests(product_type, created_at desc);

alter table public.catalog_item_type_feature_requests enable row level security;

do $$
begin
  create policy catalog_item_type_feature_requests_select_org_members
    on public.catalog_item_type_feature_requests
    for select
    using (
      exists (
        select 1
        from public.organization_members m
        where m.org_id = catalog_item_type_feature_requests.org_id
          and m.user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy catalog_item_type_feature_requests_insert_self
    on public.catalog_item_type_feature_requests
    for insert
    with check (
      requested_by_user_id = auth.uid()
      and exists (
        select 1
        from public.organization_members m
        where m.org_id = catalog_item_type_feature_requests.org_id
          and m.user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

comment on table public.catalog_item_type_feature_requests is
  'Demand signals for unsupported catalog item product types requested from dashboard create-item flow.';
