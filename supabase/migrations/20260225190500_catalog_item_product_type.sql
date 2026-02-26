-- Add Square-style catalog item product type classification to public.items.
-- We keep all known values for compatibility/future analytics, but UI can enable
-- only a subset (for now: REGULAR, FOOD_AND_BEV).

do $$
begin
  create type public.catalog_item_product_type as enum (
    'REGULAR',
    'APPOINTMENTS_SERVICE',
    'FOOD_AND_BEV',
    'EVENT',
    'DIGITAL',
    'DONATION',
    'ONLINE_SERVICE',
    'ONLINE_MEMBERSHIP'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.items
  add column if not exists product_type public.catalog_item_product_type;

update public.items
set product_type = 'REGULAR'
where product_type is null;

alter table public.items
  alter column product_type set default 'REGULAR',
  alter column product_type set not null;

comment on column public.items.product_type is
  'Square-style catalog item product type classification. UI may support only a subset of enum values.';
