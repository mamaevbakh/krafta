-- Keep public.catalog_search_documents synchronized with source catalog tables.
-- This migration adds source-table triggers and performs a full backfill.

create or replace function public.catalog_search_sync_category_document(p_category_id uuid)
returns void
language plpgsql
as $$
declare
  v_category record;
begin
  select
    c.id,
    c.catalog_id,
    c.name,
    c.slug,
    cat.org_id
  into v_category
  from public.catalog_categories c
  join public.catalogs cat on cat.id = c.catalog_id
  where c.id = p_category_id;

  if not found then
    return;
  end if;

  delete from public.catalog_search_documents
  where source_table = 'catalog_categories'
    and source_id::text = v_category.id::text;

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
    v_category.catalog_id,
    v_category.org_id,
    'catalog_categories',
    v_category.id,
    null,
    v_category.name,
    v_category.slug,
    null,
    array['category']::text[]
  );

  delete from public.catalog_search_documents d
  where d.source_table = 'catalog_category_translations'
    and d.source_id::text in (
      select t.id::text
      from public.catalog_category_translations t
      where t.category_id = v_category.id
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
    v_category.catalog_id,
    v_category.org_id,
    'catalog_category_translations',
    t.id,
    t.locale,
    t.name,
    v_category.slug,
    t.description,
    array['category', 'translation']::text[]
  from public.catalog_category_translations t
  where t.category_id = v_category.id;
end;
$$;

create or replace function public.catalog_search_sync_item_document(p_item_id uuid)
returns void
language plpgsql
as $$
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
$$;

create or replace function public.trg_catalog_search_sync_category()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.catalog_search_documents
    where source_table = 'catalog_categories'
      and source_id::text = old.id::text;
    return old;
  end if;

  perform public.catalog_search_sync_category_document(new.id);
  return new;
end;
$$;

create or replace function public.trg_catalog_search_sync_category_translation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.catalog_search_documents
    where source_table = 'catalog_category_translations'
      and source_id::text = old.id::text;
    return old;
  end if;

  if tg_op = 'UPDATE' and new.category_id is distinct from old.category_id then
    perform public.catalog_search_sync_category_document(old.category_id);
  end if;

  perform public.catalog_search_sync_category_document(new.category_id);
  return new;
end;
$$;

create or replace function public.trg_catalog_search_sync_item()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.catalog_search_documents
    where source_table = 'items'
      and source_id::text = old.id::text;
    return old;
  end if;

  perform public.catalog_search_sync_item_document(new.id);
  return new;
end;
$$;

create or replace function public.trg_catalog_search_sync_item_translation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.catalog_search_documents
    where source_table = 'item_translations'
      and source_id::text = old.id::text;
    return old;
  end if;

  if tg_op = 'UPDATE' and new.item_id is distinct from old.item_id then
    perform public.catalog_search_sync_item_document(old.item_id);
  end if;

  perform public.catalog_search_sync_item_document(new.item_id);
  return new;
end;
$$;

drop trigger if exists trg_catalog_search_sync_category
  on public.catalog_categories;
create trigger trg_catalog_search_sync_category
after insert or update or delete on public.catalog_categories
for each row execute function public.trg_catalog_search_sync_category();

drop trigger if exists trg_catalog_search_sync_category_translation
  on public.catalog_category_translations;
create trigger trg_catalog_search_sync_category_translation
after insert or update or delete on public.catalog_category_translations
for each row execute function public.trg_catalog_search_sync_category_translation();

drop trigger if exists trg_catalog_search_sync_item
  on public.items;
create trigger trg_catalog_search_sync_item
after insert or update or delete on public.items
for each row execute function public.trg_catalog_search_sync_item();

drop trigger if exists trg_catalog_search_sync_item_translation
  on public.item_translations;
create trigger trg_catalog_search_sync_item_translation
after insert or update or delete on public.item_translations
for each row execute function public.trg_catalog_search_sync_item_translation();

-- Full backfill for all source rows to guarantee search coverage.
delete from public.catalog_search_documents
where source_table in (
  'catalog_categories',
  'catalog_category_translations',
  'items',
  'item_translations'
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
  c.catalog_id,
  cat.org_id,
  'catalog_categories',
  c.id,
  null,
  c.name,
  c.slug,
  null,
  array['category']::text[]
from public.catalog_categories c
join public.catalogs cat on cat.id = c.catalog_id;

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
  c.catalog_id,
  cat.org_id,
  'catalog_category_translations',
  t.id,
  t.locale,
  t.name,
  c.slug,
  t.description,
  array['category', 'translation']::text[]
from public.catalog_category_translations t
join public.catalog_categories c on c.id = t.category_id
join public.catalogs cat on cat.id = c.catalog_id;

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
  i.catalog_id,
  cat.org_id,
  'items',
  i.id,
  null,
  i.name,
  coalesce(c.name, c.slug, i.slug),
  i.description,
  array['item']::text[]
from public.items i
join public.catalogs cat on cat.id = i.catalog_id
left join public.catalog_categories c on c.id = i.category_id;

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
  i.catalog_id,
  cat.org_id,
  'item_translations',
  t.id,
  t.locale,
  t.name,
  coalesce(c.name, c.slug, i.slug),
  coalesce(t.description, i.description),
  array['item', 'translation']::text[]
from public.item_translations t
join public.items i on i.id = t.item_id
join public.catalogs cat on cat.id = i.catalog_id
left join public.catalog_categories c on c.id = i.category_id;
