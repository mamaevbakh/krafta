-- tasnif: search over the IKPU catalog.
--
-- WHY THIS EXISTS
-- ---------------
-- The official search only finds a code when the query uses the catalog's own
-- wording: «капучино» finds nothing, «osh» finds software design services.
-- This is the search behind tasnif.krafta.uz (and later its agent's tool). It
-- answers in any script (Russian, Uzbek Latin, Uzbek Cyrillic, English by
-- meaning), tolerates typos, and treats a pasted number as the code, barcode or
-- package code it probably is.
--
-- HOW IT RANKS, AND WHY THIS SHAPE
-- --------------------------------
-- kraftabase is a 1 GB instance shared with live shops and payments, so the
-- expensive signals run on a small set and the cheap one runs on everything:
--
--   A. words, on all ~440k codes: full-text match of every query word (the last
--      as a prefix) in a script-neutral document. Finds brands and products
--      («torabika», «iphone 15»).
--   B. typos, on ~22k category documents: trigram word similarity over tree
--      nodes, category-level codes and service/cafe codes only.
--   C. meaning, on ~15k documents: nearest embeddings among tree nodes and
--      service/cafe codes (vectors are written by apps/tasnif/scripts).
--
--   B and C find categories; a category hit then stands for the generic codes
--   under it. A and the expanded categories are fused by rank (RRF, k = 60),
--   never by adding raw scores, as in Krafta's storefront search (114/116 on its
--   eval). Branded variants are capped at two per sub-position so one brand's
--   30 pack sizes can't bury the answer, and the best result of each kind
--   (goods / service / catering) is lifted to the top when it is at least half
--   as strong as the leader: «капучино» should show the cafe code next to the
--   Torabika sachet, not three sachets.
--
-- Without a query embedding (no OpenAI key, or the call failed) the search
-- still works on A and B.
--
-- ADDITIVE AND REVERSIBLE
-- -----------------------
-- Touches schema `tasnif` only; nothing outside reads it. Functions are
-- executable by service_role only (EXECUTE is revoked from PUBLIC, which
-- Postgres grants by default). Rollback:
-- `supabase/rollback/20260917051500_tasnif_search.down.sql`.

-- ---------------------------------------------------------------------------
-- search_text: one script-neutral form for documents and queries
-- ---------------------------------------------------------------------------
-- Lowercase, Cyrillic (Russian and Uzbek) to Latin, apostrophes of every kind
-- removed, anything else that isn't a letter or digit becomes a space. Both
-- sides go through the same function, so «қаҳва», «qahva» and «qahva» meet, and
-- «o‘quv», «o'quv» and «oquv» are the same word. Same letter table as Krafta's
-- public.uz_cyrl_to_latn(), copied rather than referenced so tasnif depends on
-- nothing outside its schema.
create or replace function tasnif.search_text(q text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    translate(
      replace(replace(replace(replace(replace(replace(replace(replace(
        lower(coalesce(q, '')),
        'ё', 'yo'), 'ц', 'ts'), 'ч', 'ch'), 'ш', 'sh'), 'щ', 'sh'), 'ю', 'yu'), 'я', 'ya'), 'ъ', ''),
      'абвгдежзийклмнопрстуфхыэўғқҳьʻʼ‘’`´''',
      'abvgdejziyklmnoprstufxieogqh'),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- search_documents
-- ---------------------------------------------------------------------------
-- One row per active code and per tree node. Kept apart from tasnif.codes so
-- rebuilding documents never rewrites the catalog rows, and so nodes and codes
-- share one index.
create table if not exists tasnif.search_documents (
  key text primary key,
  entity text not null
    constraint search_documents_entity check (entity in ('code', 'node')),
  level text not null
    constraint search_documents_level check (level in ('group', 'class', 'position', 'subposition', 'code')),
  kind text not null
    constraint search_documents_kind check (kind in ('goods', 'service', 'catering')),
  subposition_code text,
  is_branded boolean not null default false,
  -- A code whose brand and attribute digits are all zero: the generic code for
  -- its sub-position, usually what a small business should use.
  is_category_level boolean not null default false,
  -- Everyday words people use for this entry, in Russian, Uzbek and English
  -- («капучино, латте, раф» for cafe drinks). Written by a one-time AI pass;
  -- survives document rebuilds.
  everyday_terms text,
  doc text not null,
  doc_tsv tsvector generated always as (to_tsvector('simple'::regconfig, doc)) stored,
  -- The exact text that was embedded, so the embedding script can tell when a
  -- vector is stale.
  embed_text text,
  embedding extensions.halfvec(1536),
  embedded_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists search_documents_doc_tsv_idx
  on tasnif.search_documents using gin (doc_tsv);

-- Leg B. The predicate must match the one in tasnif.search() exactly, or the
-- planner won't use this index.
create index if not exists search_documents_category_trgm_idx
  on tasnif.search_documents using gin (doc extensions.gin_trgm_ops)
  where (entity = 'node' or kind <> 'goods' or is_category_level);

-- Leg C.
create index if not exists search_documents_embedding_idx
  on tasnif.search_documents using hnsw (embedding extensions.halfvec_cosine_ops)
  with (m = 16, ef_construction = 64)
  where embedding is not null;

alter table tasnif.search_documents enable row level security;
grant all on tasnif.search_documents to service_role;

-- ---------------------------------------------------------------------------
-- refresh_search_documents(group): rebuild documents for one catalog group
-- ---------------------------------------------------------------------------
-- Called once per group (001-117) after an import, with pauses in between, so a
-- full rebuild never becomes one 450k-row statement on the shared instance.
-- Writes only documents whose content changed; removes documents for codes that
-- are no longer active.
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
      case when n.code like '10202%' then 'catering' when n.code like '1%' then 'service' else 'goods' end as kind,
      case when n.level = 'subposition' then n.code end as subposition_code,
      tasnif.search_text(concat_ws(' ', n.name_ru, n.name_uz_latn, d.everyday_terms)) as doc
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
      tasnif.search_text(concat_ws(' ', c.name_ru, c.name_uz_latn, d.everyday_terms)) as doc
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
-- embedding_inputs: what each embeddable document should be embedded as
-- ---------------------------------------------------------------------------
-- The category path in Russian and Uzbek, then the everyday words. The path is
-- what lets «Основные блюда» under cafe services mean something different from
-- «Готовые основные блюда» sold in shops.
create or replace view tasnif.embedding_inputs
with (security_invoker = true)
as
select d.key,
  concat_ws(E'\n',
    concat_ws(' › ', g.name_ru, cl.name_ru, p.name_ru, s.name_ru, c.name_ru),
    nullif(concat_ws(' › ', g.name_uz_latn, cl.name_uz_latn, p.name_uz_latn, s.name_uz_latn, c.name_uz_latn), ''),
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
-- search(query, embedding, limit)
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
  v_words tsquery;
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
      select c.ikpu, c.status, 'barcode', 2, 0.9
      from tasnif.codes c where length(v_digits) between 8 and 14 and c.barcode = v_digits
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
      coalesce(c.kind, case when r.ikpu like '10202%' then 'catering' when r.ikpu like '1%' then 'service' else 'goods' end),
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

  -- Words. Very common connecting words would match most of the catalog and
  -- only slow the full-text leg down.
  v_tokens := array(
    select t from unnest(string_to_array(v_q, ' ')) as t
    where t <> '' and not (t = any (array[
      'i', 'v', 'vo', 'na', 'dlya', 's', 'so', 'po', 'iz', 'ot', 'do', 'bez', 'ili', 'k', 'u', 'o', 'ob', 'za', 'pri', 'a',
      'va', 'uchun', 'bilan', 'ham', 'yoki',
      'the', 'an', 'for', 'of', 'and', 'with', 'to', 'in'
    ]))
  );
  v_count := coalesce(array_length(v_tokens, 1), 0);
  if v_count = 0 and p_query_embedding is null then
    return;
  end if;
  if v_count > 0 then
    v_words := to_tsquery('simple',
      array_to_string(v_tokens[1:v_count - 1] || (v_tokens[v_count] || ':*'), ' & '));
  end if;

  -- 0.5, not pg_trgm's looser settings: short words share too many trigrams by
  -- chance («кофе» and «компенсация» both start with ' ko'), and every category
  -- this leg lets in brings six codes with it.
  perform set_config('pg_trgm.word_similarity_threshold', '0.5', true);
  perform set_config('hnsw.ef_search', '100', true);

  return query
  with lexical as (          -- A: words, on every code
    select d.key,
      row_number() over (order by ts_rank_cd(d.doc_tsv, v_words) desc, d.is_branded, length(d.doc), d.key) as r
    from tasnif.search_documents d
    where v_words is not null and d.entity = 'code' and d.doc_tsv @@ v_words
    order by ts_rank_cd(d.doc_tsv, v_words) desc, d.is_branded, length(d.doc), d.key
    limit 200
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
    from (select key, entity, r from fuzzy union all select key, entity, r from semantic) x
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
revoke all on function tasnif.search_text(text) from public, anon, authenticated;
revoke all on function tasnif.refresh_search_documents(text) from public, anon, authenticated;
revoke all on function tasnif.search(text, extensions.halfvec, integer) from public, anon, authenticated;
grant execute on function tasnif.search_text(text) to service_role;
grant execute on function tasnif.refresh_search_documents(text) to service_role;
grant execute on function tasnif.search(text, extensions.halfvec, integer) to service_role;
