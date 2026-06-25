-- Storefront search rebuild — RRF hybrid + multilingual + dedup
-- ============================================================
-- Replaces the hand-weighted additive `catalog_search_auto` (which summed
-- ts_rank_cd, trigram similarity and 1/(1+cosdist) on incomparable scales and
-- then hard-gated rows on cosine distance <= 0.812) with a Reciprocal Rank
-- Fusion (RRF) hybrid that:
--   * fuses the full-text rank list and the vector rank list by RANK, not raw
--     score, so neither leg structurally dominates (the old additive form let
--     the vector term, always ~0.5-1.0, bury exact keyword hits);
--   * REMOVES the cosine cliffs entirely — a far embedding can no longer drop a
--     perfect name match (the "type the exact item name and get nothing" bug);
--   * boosts exact / prefix / token title matches in RRF units (Algolia-style
--     "exact beats fuzzy beats semantic");
--   * de-duplicates server-side to ONE row per logical entity (an item's
--     canonical row + all its per-locale translation rows collapse via
--     item_translations.item_id), so per-locale fanout stops eating the limit;
--   * bridges scripts: a Cyrillic query is also matched as its Latin
--     transliteration (qahva <- қаҳва) via uz_cyrl_to_latn();
--   * degrades cleanly to keyword-only when no query embedding is supplied
--     (short queries, or the embed call being skipped/unavailable);
--   * keeps the HNSW index usable under per-shop scope filters via
--     hnsw.iterative_scan = relaxed_order.
--
-- The function keeps the SAME name + arg shape the /api/search route already
-- calls, and a SUPERSET of the old return columns (adds entity_id,
-- source_table), so no application/route change is required to ship this.
--
-- COMPANION (NON-DB) CHANGES shipped alongside this migration — these are NOT
-- carried by Postgres migrations and must be applied per environment:
--   1. Edge functions `embed` and `embed_query` updated to use
--      text-embedding-3-large @ 1536 dims (Matryoshka-truncated; reuses the
--      existing halfvec(1536) column + HNSW index). Deploy both.
--   2. Project secrets: OPENAI_EMBEDDING_MODEL=text-embedding-3-large,
--      OPENAI_EMBEDDING_DIMENSIONS=1536  (the deployed code defaults to these,
--      but an existing OPENAI_EMBEDDING_MODEL secret would override the code).
--   3. Re-embed the whole catalog_search_documents corpus with the new model
--      (3-small and 3-large are different vector spaces — never mix them):
--        update catalog_search_documents set embedding = null;
--        -- re-enqueue every row into pgmq 'embedding_jobs' (see queue_embeddings
--        --  payload) and let util.process_embeddings()/the cron drain it.
--   4. After the corpus is fully re-embedded, the HNSW rebuild below makes the
--      graph reflect the new vectors.

-- 1) Uzbek/Cyrillic -> Latin transliteration (search-oriented: drops soft/hard
--    signs and special marks; also transliterates shared Russian Cyrillic
--    letters). Replaces the old 3-rule search_simple_translit hack.
create or replace function public.uz_cyrl_to_latn(q text)
returns text language sql immutable
as $$
  select translate(
    replace(replace(replace(replace(replace(replace(replace(replace(
      lower(coalesce(q, '')),
      'ё','yo'),'ц','ts'),'ч','ch'),'ш','sh'),'щ','sh'),'ю','yu'),'я','ya'),'ъ',''),
    'абвгдежзийклмнопрстуфхыэўғқҳьіъ',
    'abvgdejziyklmnoprstufxieogqh'
  );
$$;

-- 2) RRF hybrid search. Drop BOTH possible prior signatures (the 5-arg baseline
--    and any 12-arg interim) because the return type changes (adds entity_id,
--    source_table), which CREATE OR REPLACE cannot do.
drop function if exists public.catalog_search_auto(text, extensions.halfvec, integer, uuid, uuid);
drop function if exists public.catalog_search_auto(text, extensions.halfvec, integer, uuid, uuid, double precision, double precision, integer, double precision, double precision, double precision, double precision);

create function public.catalog_search_auto(
  p_query           text,
  p_query_embedding extensions.halfvec default null,
  p_limit           integer default 20,
  p_org_id          uuid default null,
  p_catalog_id      uuid default null,
  p_fts_weight      double precision default 1.0,
  p_vec_weight      double precision default 1.0,
  p_rrf_k           integer default 60,
  p_exact_boost     double precision default 0.30,
  p_prefix_boost    double precision default 0.15,
  p_word_boost      double precision default 0.08,
  p_trgm_threshold  double precision default 0.30
)
returns table(
  id uuid, title text, subtitle text, description text, tags text[],
  org_id uuid, catalog_id uuid, locale text,
  score double precision, mode text,
  rank_fts real, sim_title real, sim_desc real, distance real,
  entity_id text, source_table text
)
language plpgsql stable
as $$
#variable_conflict use_column
declare
  v_norm text := public.search_normalize(p_query);
  v_lat  text := public.uz_cyrl_to_latn(public.search_normalize(p_query));
  v_tsq  tsquery := websearch_to_tsquery('simple', coalesce(v_norm, ''));
  v_pool integer := greatest(coalesce(p_limit, 20), 20) * 5;
begin
  -- multi-script lexical bridge: OR in the Latin transliteration of a Cyrillic
  -- query so "қаҳва" also matches Latin-stored "qahva".
  if v_lat is distinct from v_norm and length(coalesce(v_lat,'')) > 0 then
    v_tsq := v_tsq || websearch_to_tsquery('simple', v_lat);
  end if;

  -- keep the ANN candidate set full even after per-shop scope filtering
  perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  perform set_config('hnsw.ef_search', '200', true);

  return query
  with candidates as (
    select
      d.id, d.title, d.subtitle, d.description, d.tags,
      d.org_id, d.catalog_id, d.locale, d.fts, d.embedding,
      d.source_table, d.created_at,
      lower(extensions.unaccent(coalesce(d.title,''))) as t_norm,
      -- logical entity id: collapse an item's canonical row with all its
      -- per-locale translation rows (and likewise for categories)
      case
        when d.source_table = 'items' then d.source_id
        when d.source_table = 'item_translations' then it.item_id
        when d.source_table = 'catalog_categories' then d.source_id
        when d.source_table = 'catalog_category_translations' then ct.category_id
        else d.source_id
      end as entity_uuid
    from public.catalog_search_documents d
    left join public.item_translations it
      on d.source_table = 'item_translations' and it.id = d.source_id
    left join public.catalog_category_translations ct
      on d.source_table = 'catalog_category_translations' and ct.id = d.source_id
    where (p_org_id is null or d.org_id = p_org_id)
      and (p_catalog_id is null or d.catalog_id = p_catalog_id)
  ),
  -- LEXICAL leg: FTS rank OR'd with trigram word-similarity (typo/prefix), in
  -- both the query's original script and its Latin transliteration.
  lex as (
    select c.*,
      greatest(
        case when v_tsq is not null then ts_rank_cd(c.fts, v_tsq, 1|32) else 0 end,
        extensions.word_similarity(v_norm, c.t_norm),
        extensions.word_similarity(v_lat,  c.t_norm)
      ) as lex_score
    from candidates c
    where (v_tsq is not null and c.fts @@ v_tsq)
       or extensions.word_similarity(v_norm, c.t_norm) > p_trgm_threshold
       or extensions.word_similarity(v_lat,  c.t_norm) > p_trgm_threshold
       or c.t_norm like v_norm || '%'
       or c.t_norm like v_lat  || '%'
  ),
  lex_ranked as (
    select l.*, row_number() over (order by l.lex_score desc, l.created_at desc) as lrank
    from lex l order by lrank limit v_pool
  ),
  -- VECTOR leg: nearest neighbours by cosine distance (no distance gate).
  vec_ranked as (
    select c.*,
      (c.embedding <=> p_query_embedding)::real as cosdist,
      row_number() over (order by c.embedding <=> p_query_embedding) as vrank
    from candidates c
    where p_query_embedding is not null and c.embedding is not null
    order by c.embedding <=> p_query_embedding limit v_pool
  ),
  -- collapse each leg to entity level (best rank per entity)
  lex_e as (
    select entity_uuid, min(lrank) as lrank, max(lex_score) as lex_score
    from lex_ranked group by entity_uuid
  ),
  vec_e as (
    select entity_uuid, min(vrank) as vrank, min(cosdist) as cosdist
    from vec_ranked group by entity_uuid
  ),
  ent as (
    select entity_uuid from lex_e
    union
    select entity_uuid from vec_e
  ),
  -- one representative doc per entity (prefer canonical locale-null row)
  meta as (
    select distinct on (c.entity_uuid)
      c.entity_uuid, c.id as rep_id, c.title, c.subtitle, c.description, c.tags,
      c.org_id, c.catalog_id, c.locale, c.source_table
    from candidates c join ent e on e.entity_uuid = c.entity_uuid
    order by c.entity_uuid, (c.locale is null) desc, c.created_at
  ),
  -- exact / prefix / token title boosts, evaluated across all locale rows of
  -- the entity and across both query scripts
  boosts as (
    select c.entity_uuid,
      max((c.t_norm = v_norm or c.t_norm = v_lat)::int) as is_exact,
      max((c.t_norm like v_norm || '%' or c.t_norm like v_lat || '%')::int) as is_prefix,
      max((v_tsq is not null and to_tsvector('simple', c.t_norm) @@ v_tsq)::int) as is_word
    from candidates c join ent e on e.entity_uuid = c.entity_uuid
    group by c.entity_uuid
  )
  select
    m.rep_id, m.title, m.subtitle, m.description, m.tags,
    m.org_id, m.catalog_id, m.locale,
    (
      coalesce(p_fts_weight / (p_rrf_k + le.lrank), 0)
      + coalesce(p_vec_weight / (p_rrf_k + ve.vrank), 0)
      + case when b.is_exact = 1 then p_exact_boost
             when b.is_prefix = 1 then p_prefix_boost
             else 0 end
      + case when b.is_word = 1 then p_word_boost else 0 end
    )::double precision,
    case when p_query_embedding is null then 'keyword' else 'hybrid' end,
    coalesce(le.lex_score, 0)::real,
    0::real,
    0::real,
    coalesce(ve.cosdist, 1.0)::real,
    m.entity_uuid::text,
    m.source_table
  from ent e
  join meta m on m.entity_uuid = e.entity_uuid
  left join lex_e le on le.entity_uuid = e.entity_uuid
  left join vec_e ve on ve.entity_uuid = e.entity_uuid
  left join boosts b on b.entity_uuid = e.entity_uuid
  order by 9 desc, m.title
  limit least(greatest(coalesce(p_limit,20), 1), 100);
end;
$$;

-- 3) Rebuild the HNSW index with explicit tuning params (the original set
--    neither m nor ef_construction). Safe to run after the corpus is
--    re-embedded with the new model.
drop index if exists public.catalog_search_documents_embedding_hnsw;
create index catalog_search_documents_embedding_hnsw
  on public.catalog_search_documents
  using hnsw (embedding extensions.halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);

-- 4) Composite scope index so the storefront's (org_id, catalog_id) filter is
--    a single cheap index probe.
create index if not exists catalog_search_documents_scope_idx
  on public.catalog_search_documents (org_id, catalog_id);
