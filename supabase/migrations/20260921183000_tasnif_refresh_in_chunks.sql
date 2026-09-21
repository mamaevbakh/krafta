-- tasnif: rebuild search documents in chunks of codes, not whole catalog groups.
--
-- WHY THIS EXISTS
-- ---------------
-- refresh_search_documents(group) rebuilt a whole group in one statement. With
-- search v2's heavier text normalisation, group 068 (82,037 codes, 74,867 of
-- them in one class of concrete slabs) ran past the statement timeout and the
-- rebuild stopped halfway, leaving documents in two formats. Groups can't be
-- split along the tree either: single classes are too big. So documents are
-- now rebuilt in three kinds of small statements the caller schedules:
--
--   refresh_search_nodes(group)        the ~15k tree nodes, one group at a time
--   refresh_search_codes(lo, hi)       active codes in an IKPU range (callers
--                                      pass ranges of ~10-20k codes)
--   remove_stale_search_documents()    documents whose code is no longer active
--
-- Same document format and write-only-what-changed rule as v2. The group-level
-- function is dropped so nothing calls the version that can time out.
--
-- ADDITIVE AND REVERSIBLE
-- -----------------------
-- Touches schema `tasnif` only. Rollback:
-- `supabase/rollback/20260921183000_tasnif_refresh_in_chunks.down.sql`.

drop function if exists tasnif.refresh_search_documents(text);

create or replace function tasnif.refresh_search_nodes(p_group text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_written integer;
begin
  if p_group is null or p_group !~ '^[0-9]{3}$' then
    raise exception 'refresh_search_nodes: group must be three digits, got %', p_group;
  end if;

  with source as (
    select n.code as key,
      n.level,
      tasnif.kind_of(n.code) as kind,
      case when n.level = 'subposition' then n.code end as subposition_code,
      tasnif.search_text(concat_ws(' ',
        tasnif.strip_exclusions(n.name_ru), tasnif.strip_exclusions(n.name_uz_latn), d.everyday_terms)) as doc
    from tasnif.nodes n
    left join tasnif.search_documents d on d.key = n.code
    where left(n.code, 3) = p_group
  ), written as (
    insert into tasnif.search_documents as t (key, entity, level, kind, subposition_code, doc)
    select key, 'node', level, kind, subposition_code, doc from source
    on conflict (key) do update
      set level = excluded.level, kind = excluded.kind, subposition_code = excluded.subposition_code,
          doc = excluded.doc, updated_at = now()
    where t.doc is distinct from excluded.doc or t.kind is distinct from excluded.kind
    returning 1
  )
  select count(*)::integer into v_written from written;
  return v_written;
end;
$$;

create or replace function tasnif.refresh_search_codes(p_lo text, p_hi text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_written integer;
begin
  if p_lo !~ '^[0-9]{17}$' or p_hi !~ '^[0-9]{17}$' or p_lo > p_hi then
    raise exception 'refresh_search_codes: need two 17-digit codes, lo <= hi; got % and %', p_lo, p_hi;
  end if;

  with source as (
    select c.ikpu as key, c.kind, c.subposition_code, c.is_branded,
      right(c.ikpu, 6) = '000000' as is_category_level,
      tasnif.search_text(concat_ws(' ',
        tasnif.strip_exclusions(c.name_ru), tasnif.strip_exclusions(c.name_uz_latn), d.everyday_terms)) as doc
    from tasnif.codes c
    left join tasnif.search_documents d on d.key = c.ikpu
    where c.ikpu between p_lo and p_hi and c.status = 'active'
  ), written as (
    insert into tasnif.search_documents as t (key, entity, level, kind, subposition_code, is_branded, is_category_level, doc)
    select key, 'code', 'code', kind, subposition_code, is_branded, is_category_level, doc from source
    on conflict (key) do update
      set kind = excluded.kind, subposition_code = excluded.subposition_code, is_branded = excluded.is_branded,
          is_category_level = excluded.is_category_level, doc = excluded.doc, updated_at = now()
    where t.doc is distinct from excluded.doc or t.kind is distinct from excluded.kind
       or t.is_branded is distinct from excluded.is_branded
    returning 1
  )
  select count(*)::integer into v_written from written;
  return v_written;
end;
$$;

create or replace function tasnif.remove_stale_search_documents()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_removed integer;
begin
  with removed as (
    delete from tasnif.search_documents d
    where d.entity = 'code'
      and not exists (select 1 from tasnif.codes c where c.ikpu = d.key and c.status = 'active')
    returning 1
  )
  select count(*)::integer into v_removed from removed;
  return v_removed;
end;
$$;

revoke all on function tasnif.refresh_search_nodes(text) from public, anon, authenticated;
revoke all on function tasnif.refresh_search_codes(text, text) from public, anon, authenticated;
revoke all on function tasnif.remove_stale_search_documents() from public, anon, authenticated;
grant execute on function tasnif.refresh_search_nodes(text) to service_role;
grant execute on function tasnif.refresh_search_codes(text, text) to service_role;
grant execute on function tasnif.remove_stale_search_documents() to service_role;
