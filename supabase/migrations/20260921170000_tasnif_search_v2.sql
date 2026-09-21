-- tasnif: search v2 — fix what the first benchmark run showed, without new AI.
--
-- WHY THIS EXISTS
-- ---------------
-- The first full run (155 reviewed cases, words and typos only) put a right
-- code in the top 3 for 45% of searches against the official site's 23%. The
-- misses split into vocabulary (the catalog never says «плов» or «стрижка»;
-- that needs the everyday-words pass and embeddings) and a set of mechanical
-- faults this migration fixes:
--
-- 1. Every word had to match. «шампунь для волос» could not find "Шампунь (всех
--    видов)" because that name has no «волос». Now each word counts toward a
--    coverage score: more matched words rank higher, and a result may miss one.
-- 2. Word endings. «зарядка для телефона», «курсы английского» did not match
--    «телефоны», «курсов». Query words longer than four letters now lose a
--    Russian case ending and match as a prefix (tasnif.search_stem).
-- 3. Specific beat general. On equal coverage, category-level and unbranded
--    codes now rank before branded ones, so a generic search («подгузники»)
--    shows the code a shop should use before one brand's pack.
-- 4. Words that only exist in category headings («смартфон», «минеральная
--    вода» never appear in a code's own name) now find the heading, and the
--    heading stands for its generic codes, like a typo or meaning hit does.
-- 5. Spelling across scripts. Doubled letters are collapsed («капуччино» meets
--    «капучино») and Latin c before anything but h reads as k, so «кока-кола»
--    meets "COCA-COLA" and «кофе» meets "coffee".
-- 6. Exclusions. ~7,600 names say what a code does NOT cover ("Юридические
--    услуги (кроме консультаций)", "…dan tashqari"). Those words used to make
--    the code match the very thing it excludes; they are now left out of the
--    searchable text. Displayed names are unchanged.
-- 7. Barcodes are compared without leading zeros. Scanners and marking codes
--    add them (049000014242, 04780014240055) and the catalog stores some
--    barcodes both ways, so exact equality found nothing.
-- 8. Utilities (group 099, "КОММУНАЛЬНЫЕ УСЛУГИ") are services, not goods.
-- 9. Short queries need closer typo matches (0.7 instead of 0.5 up to five
--    letters): «плов» was matching «полов», «латте» the Uzbek «latta» (rag).
--
-- ADDITIVE AND REVERSIBLE
-- -----------------------
-- Touches schema `tasnif` only. Changing codes.kind rewrites tasnif.codes
-- (~440k rows, ~30 s, nothing outside tasnif reads it). Search documents must
-- be rebuilt afterwards (`pnpm --filter tasnif search:refresh`), because every
-- document's normalised text changes. Rollback:
-- `supabase/rollback/20260921170000_tasnif_search_v2.down.sql`.

-- ---------------------------------------------------------------------------
-- kind_of: goods | service | catering, in one place
-- ---------------------------------------------------------------------------
create or replace function tasnif.kind_of(p_code text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when left(p_code, 5) = '10202' then 'catering'
    when left(p_code, 1) = '1' or left(p_code, 3) = '099' then 'service'
    else 'goods'
  end;
$$;

alter table tasnif.codes alter column kind set expression as (tasnif.kind_of(ikpu));

-- ---------------------------------------------------------------------------
-- search_text v2
-- ---------------------------------------------------------------------------
-- Same as v1 (lowercase, Cyrillic to Latin, apostrophes out, anything else a
-- space) plus: Latin c not followed by h becomes k, and repeated letters or
-- digraphs collapse to one («капуччино» is "kapuchchino" before that).
-- Applied identically to documents and queries.
create or replace function tasnif.search_text(q text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    translate(
      replace(replace(replace(replace(replace(replace(replace(replace(
        lower(coalesce(q, '')),
        'ё', 'yo'), 'ц', 'ts'), 'ч', 'ch'), 'ш', 'sh'), 'щ', 'sh'), 'ю', 'yu'), 'я', 'ya'), 'ъ', ''),
      'абвгдежзийклмнопрстуфхыэўғқҳьʻʼ‘’`´''',
      'abvgdejziyklmnoprstufxieogqh'),
    'c(?!h)', 'k', 'g'),
    '(ch|sh|ts)\1+', '\1', 'g'),
    '([a-z])\1+', '\1', 'g'),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- strip_exclusions: drop what a name says it does NOT cover
-- ---------------------------------------------------------------------------
-- "(кроме …)" and "(… dan tashqari)" in parentheses; ", кроме …" up to the next
-- comma, semicolon, colon or bracket; "X va Ydan tashqari" in Uzbek, where the
-- excluded nouns come before the postposition.
create or replace function tasnif.strip_exclusions(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(regexp_replace(regexp_replace(
    lower(coalesce(p, '')),
    '\([^()]*(кроме|за исключением|tashqari)[^()]*\)', ' ', 'g'),
    '(кроме|за исключением)\s[^,;:()]*', ' ', 'g'),
    '(\S+\s+va\s+)?\S+(dan|tan)\s+tashqari', ' ', 'g');
$$;

-- ---------------------------------------------------------------------------
-- search_stem: a query word without its Russian case ending
-- ---------------------------------------------------------------------------
-- Works on search_text() output (so «-ая» is "aya", «-ые» is "ie"). Only for
-- words of five letters or more, and never below four, so «кофе», «плов»,
-- «osh» stay whole. The result is matched as a prefix, which is what makes
-- «телефона» find «телефоны» and «курсы» find «курсов».
create or replace function tasnif.search_stem(p_token text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when length(p_token) >= 5 and p_token !~ '[0-9]' then coalesce((
      select left(p_token, length(p_token) - length(e))
      from unnest(array[
        'yami', 'yaya', 'yuyu', 'ami', 'imi', 'ogo', 'ego', 'omu', 'emu', 'aya', 'uyu', 'yam', 'yax',
        'ov', 'ev', 'ie', 'iy', 'oy', 'ey', 'oe', 'ee', 'am', 'ax', 'om', 'em', 'im', 'ix', 'ya', 'yu',
        'a', 'i', 'u', 'e', 'o'
      ]) as e
      where right(p_token, length(e)) = e and length(p_token) - length(e) >= 4
      order by length(e) desc
      limit 1), p_token)
    else p_token
  end;
$$;

-- ---------------------------------------------------------------------------
-- Barcodes without leading zeros
-- ---------------------------------------------------------------------------
create index if not exists codes_barcode_key_idx
  on tasnif.codes (ltrim(barcode, '0')) where barcode is not null;

-- ---------------------------------------------------------------------------
-- refresh_search_documents v2: exclusions stripped, kind via kind_of
-- ---------------------------------------------------------------------------
create or replace function tasnif.refresh_search_documents(p_group text)
returns table (nodes_written integer, codes_written integer, codes_removed integer)
language plpgsql
set search_path = ''
as $$
declare
  v_lo text;
  v_hi text;
begin
  if p_group is null or p_group !~ '^[0-9]{3}$' then
    raise exception 'refresh_search_documents: group must be three digits, got %', p_group;
  end if;
  v_lo := rpad(p_group, 17, '0');
  v_hi := rpad(p_group, 17, '9');

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
  select count(*)::integer into nodes_written from written;

  with source as (
    select c.ikpu as key, c.kind, c.subposition_code, c.is_branded,
      right(c.ikpu, 6) = '000000' as is_category_level,
      tasnif.search_text(concat_ws(' ',
        tasnif.strip_exclusions(c.name_ru), tasnif.strip_exclusions(c.name_uz_latn), d.everyday_terms)) as doc
    from tasnif.codes c
    left join tasnif.search_documents d on d.key = c.ikpu
    where c.ikpu between v_lo and v_hi and c.status = 'active'
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
  select count(*)::integer into codes_written from written;

  with removed as (
    delete from tasnif.search_documents d
    where d.entity = 'code' and d.key between v_lo and v_hi
      and not exists (select 1 from tasnif.codes c where c.ikpu = d.key and c.status = 'active')
    returning 1
  )
  select count(*)::integer into codes_removed from removed;

  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- embedding_inputs v2: exclusions stripped here too
-- ---------------------------------------------------------------------------
-- Embeddings are poor at negation: "legal services except consultations" sits
-- right next to "legal consultation". Leaving the exclusion out keeps it apart.
create or replace view tasnif.embedding_inputs
with (security_invoker = true)
as
select d.key,
  concat_ws(E'\n',
    concat_ws(' › ', g.name_ru, cl.name_ru, p.name_ru, s.name_ru, tasnif.strip_exclusions(c.name_ru)),
    nullif(concat_ws(' › ', g.name_uz_latn, cl.name_uz_latn, p.name_uz_latn, s.name_uz_latn,
      nullif(tasnif.strip_exclusions(c.name_uz_latn), '')), ''),
    d.everyday_terms) as embed_text,
  d.embed_text as embedded_text
from tasnif.search_documents d
left join tasnif.codes c on d.entity = 'code' and c.ikpu = d.key
left join tasnif.nodes g on g.code = left(d.key, 3)
left join tasnif.nodes cl on length(d.key) >= 5 and cl.code = left(d.key, 5)
left join tasnif.nodes p on length(d.key) >= 8 and p.code = left(d.key, 8)
left join tasnif.nodes s on length(d.key) >= 11 and s.code = left(d.key, 11)
where d.entity = 'node' or d.kind <> 'goods';

grant select on tasnif.embedding_inputs to service_role;

-- ---------------------------------------------------------------------------
-- search v2
-- ---------------------------------------------------------------------------
create or replace function tasnif.search(
  p_query text,
  p_query_embedding extensions.halfvec(1536) default null,
  p_limit integer default 20
)
returns table (
  ikpu text,
  status text,       -- active | inactive
  match text,        -- text | ikpu | barcode | package | prefix | same_category
  kind text,         -- goods | service | catering
  is_branded boolean,
  name_ru text,
  name_uz_latn text,
  name_uz_cyrl text,
  subposition_code text,
  score double precision
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_digits text := regexp_replace(coalesce(p_query, ''), '[\s.-]', '', 'g');
  v_q text := tasnif.search_text(p_query);
  v_tokens text[];
  v_count integer;
  v_min_cover integer;
  v_token_queries tsquery[];
  v_any tsquery;
begin
  -- A pasted number: look it up as what it could be, most specific first.
  if v_digits ~ '^[0-9]{3,17}$' then
    return query
    with hits as (
      select c.ikpu, c.status, 'ikpu'::text as match, 1 as priority, 1.0::double precision as score
      from tasnif.codes c where length(v_digits) = 17 and c.ikpu = v_digits
      union all
      select i.ikpu, 'inactive', 'ikpu', 1, 1.0
      from tasnif.inactive_codes i where length(v_digits) = 17 and i.ikpu = v_digits
      union all
      -- Leading zeros are padding: a scanned UPC-A, a GTIN-14 and the stored
      -- EAN-13 are the same number.
      select c.ikpu, c.status, 'barcode', 2, 0.9
      from tasnif.codes c
      where length(v_digits) between 8 and 14 and c.barcode is not null
        and ltrim(c.barcode, '0') = ltrim(v_digits, '0')
      union all
      select p.ikpu, 'active', 'package', 3, 0.8
      from tasnif.packages p where length(v_digits) between 4 and 9 and p.package_code = v_digits::bigint
      union all
      select x.ikpu, 'active', 'prefix', 4, 0.5
      from (
        select c.ikpu from tasnif.codes c
        where length(v_digits) in (3, 5, 8, 11, 14) and c.status = 'active'
          and c.ikpu between rpad(v_digits, 17, '0') and rpad(v_digits, 17, '9')
        order by c.is_branded, right(c.ikpu, 6) <> '000000', c.ikpu
        limit v_limit
      ) x
    ), neighbours as (
      -- A switched-off code: offer the active generic codes of its sub-position.
      select c.ikpu, c.status, 'same_category'::text as match, 5 as priority, 0.4::double precision as score
      from tasnif.inactive_codes i
      join tasnif.codes c on c.subposition_code = i.subposition_code and c.status = 'active' and not c.is_branded
      where length(v_digits) = 17 and i.ikpu = v_digits
    ), ranked as (
      select h.*, row_number() over (partition by h.ikpu order by h.priority) as dup
      from (select * from hits union all select * from neighbours) h
    )
    select r.ikpu, r.status, r.match,
      coalesce(c.kind, tasnif.kind_of(r.ikpu)),
      coalesce(c.is_branded, false),
      coalesce(c.name_ru, i.name_ru), c.name_uz_latn, c.name_uz_cyrl,
      left(r.ikpu, 11), r.score
    from ranked r
    left join tasnif.codes c on c.ikpu = r.ikpu
    left join tasnif.inactive_codes i on i.ikpu = r.ikpu
    where r.dup = 1
    order by r.priority, r.ikpu
    limit v_limit;
    return;
  end if;

  -- Words. Connecting words and single letters (units like «г», «л») would
  -- match most of the catalog and only slow the full-text legs down.
  v_tokens := array(
    select t from unnest(string_to_array(v_q, ' ')) as t
    where length(t) >= 2 and not (t = any (array[
      'na', 'dlya', 'so', 'po', 'iz', 'ot', 'do', 'bez', 'ili', 'ob', 'za', 'pri', 'vo',
      'va', 'uchun', 'bilan', 'ham', 'yoki',
      'the', 'an', 'for', 'of', 'and', 'with', 'to', 'in'
    ]))
    limit 6
  );
  v_count := coalesce(array_length(v_tokens, 1), 0);
  if v_count = 0 and p_query_embedding is null then
    return;
  end if;
  if v_count > 0 then
    -- Words of five letters or more lose their case ending and match as a
    -- prefix. Shorter words must match whole, except the last one, which may
    -- still be being typed: as a prefix, «кока» matched "кокамидопропил…".
    v_token_queries := array(
      select case
        when length(t) >= 5 or n = v_count then to_tsquery('simple', tasnif.search_stem(t) || ':*')
        else to_tsquery('simple', t)
      end
      from unnest(v_tokens) with ordinality as w(t, n));
    v_any := (select string_agg(q::text, ' | ')::tsquery from unnest(v_token_queries) as q);
    -- One word may be missing once there are two or more. Candidates that match
    -- more words still rank first; this only lets the general code in when the
    -- query adds a word its name lacks («шампунь для волос» vs "Шампунь").
    v_min_cover := greatest(1, v_count - 1);
  end if;

  -- Closer typo matches for short queries: at 0.5, «плов» matched «полов».
  perform set_config('pg_trgm.word_similarity_threshold', case when length(v_q) <= 5 then '0.7' else '0.5' end, true);
  perform set_config('hnsw.ef_search', '100', true);

  return query
  with covered as (          -- how many query words each candidate contains
    select d.key, d.entity, d.is_branded, d.is_category_level, d.doc, d.doc_tsv,
      (select count(*) from unnest(v_token_queries) q where d.doc_tsv @@ q)::integer as cover
    from tasnif.search_documents d
    where v_any is not null and d.doc_tsv @@ v_any
  ),
  lexical as (               -- A: words, on every code
    select c.key,
      row_number() over (order by c.cover desc, c.is_category_level desc, c.is_branded,
        ts_rank_cd(c.doc_tsv, v_any) desc, length(c.doc), c.key) as r
    from covered c
    where c.entity = 'code' and c.cover >= v_min_cover
    order by c.cover desc, c.is_category_level desc, c.is_branded, ts_rank_cd(c.doc_tsv, v_any) desc, length(c.doc), c.key
    limit 200
  ),
  heading_words as (         -- A': headings containing every query word («смартфон»)
    select c.key, c.entity,
      row_number() over (order by c.cover desc, ts_rank_cd(c.doc_tsv, v_any) desc, length(c.doc), c.key) as r
    from covered c
    where c.entity = 'node' and c.cover = v_count
    order by c.cover desc, ts_rank_cd(c.doc_tsv, v_any) desc, length(c.doc), c.key
    limit 30
  ),
  fuzzy as (                 -- B: typos, on categories and service/cafe codes
    select d.key, d.entity,
      row_number() over (order by extensions.word_similarity(v_q, d.doc) desc, length(d.doc), d.key) as r
    from tasnif.search_documents d
    where v_count > 0
      and (entity = 'node' or kind <> 'goods' or is_category_level)
      and v_q operator(extensions.<%) d.doc
    order by extensions.word_similarity(v_q, d.doc) desc, length(d.doc), d.key
    limit 30
  ),
  semantic as (              -- C: meaning, on categories and service/cafe codes
    select d.key, d.entity,
      row_number() over (order by d.embedding operator(extensions.<=>) p_query_embedding) as r
    from tasnif.search_documents d
    where p_query_embedding is not null and d.embedding is not null
    order by d.embedding operator(extensions.<=>) p_query_embedding
    limit 30
  ),
  categories as (
    select x.key, x.entity, sum(1.0 / (60 + x.r)) as s
    from (
      select key, entity, r from heading_words
      union all select key, entity, r from fuzzy
      union all select key, entity, r from semantic
    ) x
    group by x.key, x.entity
  ),
  category_hits as (         -- the strongest categories, as ranges of codes
    select c.key, row_number() over (order by c.s desc, c.key) as cr,
      case when c.entity = 'code' then c.key else rpad(c.key, 17, '0') end as lo,
      case when c.entity = 'code' then c.key else rpad(c.key, 17, '9') end as hi
    from categories c
    where c.entity = 'code' or length(c.key) in (8, 11)
    order by c.s desc, c.key
    limit 12
  ),
  expanded as (              -- a category hit stands for its generic codes
    select e.key, (h.cr - 1) * 6 + e.wr as r
    from category_hits h
    cross join lateral (
      select d.key,
        row_number() over (order by d.is_category_level desc, extensions.word_similarity(v_q, d.doc) desc, d.key) as wr
      from tasnif.search_documents d
      where d.key between h.lo and h.hi and d.entity = 'code' and not d.is_branded
      order by d.is_category_level desc, extensions.word_similarity(v_q, d.doc) desc, d.key
      limit 6
    ) e
  ),
  fused as (
    select k.key, sum(1.0 / (60 + k.r))::double precision as score
    from (select key, r from lexical union all select key, r from expanded) k
    group by k.key
  ),
  shaped as (
    select f.key, f.score, c.kind, c.is_branded, c.subposition_code,
      c.name_ru, c.name_uz_latn, c.name_uz_cyrl,
      row_number() over (partition by c.subposition_code, c.is_branded order by f.score desc, f.key) as per_group,
      row_number() over (partition by c.kind order by f.score desc, f.key) as per_kind,
      max(f.score) over () as top_score
    from fused f
    join tasnif.codes c on c.ikpu = f.key and c.status = 'active'
  )
  select s.key, 'active'::text, 'text'::text, s.kind, s.is_branded,
    s.name_ru, s.name_uz_latn, s.name_uz_cyrl, s.subposition_code, s.score
  from shaped s
  where not s.is_branded or s.per_group <= 2
  order by (s.per_kind = 1 and s.score >= 0.5 * s.top_score) desc, s.score desc, s.key
  limit v_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute rights: service role only
-- ---------------------------------------------------------------------------
revoke all on function tasnif.kind_of(text) from public, anon, authenticated;
revoke all on function tasnif.strip_exclusions(text) from public, anon, authenticated;
revoke all on function tasnif.search_stem(text) from public, anon, authenticated;
revoke all on function tasnif.search_text(text) from public, anon, authenticated;
revoke all on function tasnif.refresh_search_documents(text) from public, anon, authenticated;
revoke all on function tasnif.search(text, extensions.halfvec, integer) from public, anon, authenticated;
grant execute on function tasnif.kind_of(text) to service_role;
grant execute on function tasnif.strip_exclusions(text) to service_role;
grant execute on function tasnif.search_stem(text) to service_role;
grant execute on function tasnif.search_text(text) to service_role;
grant execute on function tasnif.refresh_search_documents(text) to service_role;
grant execute on function tasnif.search(text, extensions.halfvec, integer) to service_role;
