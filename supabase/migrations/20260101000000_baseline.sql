-- Krafta baseline schema migration
-- =========================================================================
-- Captures the production schema state as of 2026-05-05.
--
-- Why this exists (KRA-33):
-- The original `payments.*` tables, parts of `public.*`, and `util.*` were
-- created via the Supabase Dashboard *before* migration tracking was set up.
-- All subsequent migrations in this directory assume those objects already
-- exist. On a fresh Supabase preview branch this caused MIGRATIONS_FAILED.
--
-- This baseline reconstructs that bootstrap state via `pg_dump` of the
-- production database (public + payments + util schemas), so a fresh preview
-- branch can replay all migrations cleanly: this baseline runs first, then
-- the subsequent migrations land as either idempotent no-ops or true
-- incremental changes.
--
-- Generated via:
--   pg_dump --schema-only --no-owner --no-privileges \
--           --schema=public --schema=payments --schema=util \
--           "<prod-non-pooling-url>"
--
-- v2 (2026-05-05): added util schema (was missing — caused trigger creation
-- to fail because public triggers reference util.clear_column).
-- =========================================================================

-- Extensions used by the dumped schema (idempotent).
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "pgcrypto"  with schema extensions;
create extension if not exists "vector"    with schema extensions;
create extension if not exists "pg_trgm"   with schema extensions;
create extension if not exists "unaccent"  with schema extensions;
create extension if not exists "hstore"    with schema extensions;
create extension if not exists "pg_net"    with schema extensions;
create extension if not exists "pgmq";
create extension if not exists "pg_cron";

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: payments; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS payments;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: util; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS util;


--
-- Name: environment; Type: TYPE; Schema: payments; Owner: -
--

CREATE TYPE payments.environment AS ENUM (
    'test',
    'live'
);


--
-- Name: TYPE environment; Type: COMMENT; Schema: payments; Owner: -
--

COMMENT ON TYPE payments.environment IS 'test or live environments';


--
-- Name: org_provider_account_status; Type: TYPE; Schema: payments; Owner: -
--

CREATE TYPE payments.org_provider_account_status AS ENUM (
    'active',
    'disabled'
);


--
-- Name: catalog_item_product_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.catalog_item_product_type AS ENUM (
    'REGULAR',
    'APPOINTMENTS_SERVICE',
    'FOOD_AND_BEV',
    'EVENT',
    'DIGITAL',
    'DONATION',
    'ONLINE_SERVICE',
    'ONLINE_MEMBERSHIP'
);


--
-- Name: catalog_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.catalog_status AS ENUM (
    'draft',
    'published',
    'suspended'
);


--
-- Name: item_media_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.item_media_kind AS ENUM (
    'image',
    'video'
);


--
-- Name: role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.role AS ENUM (
    'owner',
    'member',
    'admin'
);


--
-- Name: TYPE role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.role IS 'roles for organization_members table';


--
-- Name: ack_embedding_job(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ack_embedding_job(p_job_id bigint) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  select util.ack_embedding_job(p_job_id);
$$;


--
-- Name: catalog_is_public(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.catalog_is_public(_catalog_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select _catalog_id is not null
     and exists (
       select 1
       from public.catalogs c
       where c.id = _catalog_id
         and c.status = 'published'
     );
$$;


--
-- Name: catalog_org_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.catalog_org_id(_catalog_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select c.org_id from public.catalogs c where c.id = _catalog_id;
$$;


--
-- Name: catalog_search(text, extensions.halfvec, integer, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.catalog_search(p_query text, p_query_embedding extensions.halfvec DEFAULT NULL::extensions.halfvec, p_limit integer DEFAULT 20, p_org_id uuid DEFAULT NULL::uuid, p_catalog_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, title text, subtitle text, description text, tags text[], org_id uuid, catalog_id uuid, locale text, score double precision, rank_fts real, sim_title real, sim_desc real, distance real)
    LANGUAGE sql STABLE
    AS $$
  with
    q as (
      select
        public.search_expand_query(p_query) as q_expanded,
        websearch_to_tsquery('simple', public.search_expand_query(p_query)) as tsq
    ),
    base as (
      select
        d.*,
        -- keyword rank (0..1-ish)
        ts_rank_cd(d.fts, (select tsq from q))::real as rank_fts,
        -- trigram similarity (0..1)
        extensions.similarity(public.search_normalize(d.title), (select q_expanded from q))::real as sim_title,
        extensions.similarity(public.search_normalize(d.description), (select q_expanded from q))::real as sim_desc,
        -- vector distance (smaller is better); NULL if no query embedding
        case
          when p_query_embedding is null or d.embedding is null then null
          else (d.embedding <=> p_query_embedding)::real
        end as distance
      from public.catalog_search_documents d
      where
        -- scope filters
        (p_org_id is null or d.org_id = p_org_id)
        and (p_catalog_id is null or d.catalog_id = p_catalog_id)
        and (
          -- must match something for fast pruning:
          d.fts @@ (select tsq from q)
          or extensions.similarity(public.search_normalize(d.title), (select q_expanded from q)) > 0.12
          or extensions.similarity(public.search_normalize(d.description), (select q_expanded from q)) > 0.12
        )
    )
  select
    id, title, subtitle, description, tags, org_id, catalog_id, locale,
    (
      -- weights: tune later
      (rank_fts * 1.00)
      + (greatest(sim_title, sim_desc) * 0.65)
      + (
          case
            when distance is null then 0
            else (1.0 / (1.0 + distance)) * 1.20
          end
        )
    ) as score,
    rank_fts,
    sim_title,
    sim_desc,
    distance
  from base
  order by score desc, created_at desc
  limit greatest(1, least(p_limit, 100));
$$;


--
-- Name: catalog_search_auto(text, extensions.halfvec, integer, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.catalog_search_auto(p_query text, p_query_embedding extensions.halfvec DEFAULT NULL::extensions.halfvec, p_limit integer DEFAULT 20, p_org_id uuid DEFAULT NULL::uuid, p_catalog_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, title text, subtitle text, description text, tags text[], org_id uuid, catalog_id uuid, locale text, score double precision, mode text, rank_fts real, sim_title real, sim_desc real, distance real)
    LANGUAGE plpgsql STABLE
    AS $$
declare
  q_len int := char_length(trim(coalesce(p_query,'')));
begin
  -- ---------------------------------------------
  -- MODE 1: FAST PREFIX / KEYWORD SEARCH
  -- ---------------------------------------------
  if q_len < 3 or p_query_embedding is null then
    return query
    select
      d.id,
      d.title,
      d.subtitle,
      d.description,
      d.tags,
      d.org_id,
      d.catalog_id,
      d.locale,

      (
        ts_rank_cd(d.fts, q.tsq) * 1.0
        + greatest(
            extensions.similarity(public.search_normalize(d.title), q.q_expanded),
            extensions.similarity(public.search_normalize(d.description), q.q_expanded)
          ) * 0.6
      ) as score,

      'keyword'::text as mode,

      ts_rank_cd(d.fts, q.tsq)::real as rank_fts,
      extensions.similarity(public.search_normalize(d.title), q.q_expanded)::real as sim_title,
      extensions.similarity(public.search_normalize(d.description), q.q_expanded)::real as sim_desc,
      null::real as distance

    from public.catalog_search_documents d
    cross join (
      select
        public.search_expand_query(p_query) as q_expanded,
        websearch_to_tsquery('simple', public.search_expand_query(p_query)) as tsq
    ) q
    where
      (p_org_id is null or d.org_id = p_org_id)
      and (p_catalog_id is null or d.catalog_id = p_catalog_id)
      and (
        d.fts @@ q.tsq
        or extensions.similarity(public.search_normalize(d.title), q.q_expanded) > 0.12
        or extensions.similarity(public.search_normalize(d.description), q.q_expanded) > 0.12
      )
    order by score desc, d.created_at desc
    limit greatest(1, least(p_limit, 100));
  end if;

  -- ---------------------------------------------
  -- MODE 2: HYBRID (SEMANTIC + KEYWORD)
  -- + DISTANCE GATE (query-level) AND ROW DISTANCE CUTOFF
  -- ---------------------------------------------
  return query
  with hybrid as (
    select
      d.id,
      d.title,
      d.subtitle,
      d.description,
      d.tags,
      d.org_id,
      d.catalog_id,
      d.locale,

      (
        ts_rank_cd(d.fts, q.tsq) * 0.8
        + greatest(
            extensions.similarity(public.search_normalize(d.title), q.q_expanded),
            extensions.similarity(public.search_normalize(d.description), q.q_expanded)
          ) * 0.5
        + (1.0 / (1.0 + (d.embedding <=> p_query_embedding))) * 1.5
      ) as score,

      'hybrid'::text as mode,

      ts_rank_cd(d.fts, q.tsq)::real as rank_fts,
      extensions.similarity(public.search_normalize(d.title), q.q_expanded)::real as sim_title,
      extensions.similarity(public.search_normalize(d.description), q.q_expanded)::real as sim_desc,
      (d.embedding <=> p_query_embedding)::real as distance,

      d.created_at as _created_at,
      min(d.embedding <=> p_query_embedding) over () as _min_distance
    from public.catalog_search_documents d
    cross join (
      select
        public.search_expand_query(p_query) as q_expanded,
        websearch_to_tsquery('simple', public.search_expand_query(p_query)) as tsq
    ) q
    where
      (p_org_id is null or d.org_id = p_org_id)
      and (p_catalog_id is null or d.catalog_id = p_catalog_id)
      and (
        d.fts @@ q.tsq
        or extensions.similarity(public.search_normalize(d.title), q.q_expanded) > 0.12
        or d.embedding <=> p_query_embedding < 0.9
      )
  )
  select
    h.id,
    h.title,
    h.subtitle,
    h.description,
    h.tags,
    h.org_id,
    h.catalog_id,
    h.locale,
    h.score,
    h.mode,
    h.rank_fts,
    h.sim_title,
    h.sim_desc,
    h.distance
  from hybrid h
  where h._min_distance <= 0.82
    and h.distance <= 0.812
  order by h.score desc, h._created_at desc
  limit greatest(1, least(p_limit, 100));
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: catalog_search_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_search_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid,
    catalog_id uuid,
    source_table text NOT NULL,
    source_id uuid NOT NULL,
    locale text,
    title text,
    subtitle text,
    description text,
    tags text[],
    embedding extensions.halfvec(1536),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fts tsvector
);


--
-- Name: catalog_search_documents_embedding_input(public.catalog_search_documents); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.catalog_search_documents_embedding_input(doc public.catalog_search_documents) RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select concat_ws(
    E'\n\n',
    nullif(doc.locale, ''),
    nullif(doc.title, ''),
    nullif(doc.subtitle, ''),
    nullif(doc.description, ''),
    nullif(array_to_string(doc.tags, ' '), '')
  );
$$;


--
-- Name: catalog_search_documents_fts_input(public.catalog_search_documents); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.catalog_search_documents_fts_input(doc public.catalog_search_documents) RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select concat_ws(
    ' ',
    coalesce(doc.locale, ''),
    coalesce(doc.title, ''),
    coalesce(doc.subtitle, ''),
    coalesce(doc.description, ''),
    coalesce(array_to_string(doc.tags, ' '), '')
  );
$$;


--
-- Name: catalog_search_documents_set_fts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.catalog_search_documents_set_fts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- Use "simple" config for multi-language (ru/uz/en mixed), plus unaccent
  new.fts :=
    to_tsvector(
      'simple',
      extensions.unaccent(public.catalog_search_documents_fts_input(new))
    );
  return new;
end;
$$;


--
-- Name: catalog_search_sync_category_document(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.catalog_search_sync_category_document(p_category_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

  -- Prevent direct RPC misuse: only org owners/admins can sync documents.
  if not public.is_org_role(v_category.org_id, array['owner','admin']) then
    raise exception 'not authorized' using errcode = '42501';
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


--
-- Name: catalog_search_sync_item_document(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.catalog_search_sync_item_document(p_item_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

  -- Prevent direct RPC misuse: only org owners/admins can sync documents.
  if not public.is_org_role(v_item.org_id, array['owner','admin']) then
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
$$;


--
-- Name: is_org_role(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_org_role(_org_id uuid, _roles text[] DEFAULT ARRAY['owner'::text, 'admin'::text, 'member'::text]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from public.organization_members m
    where m.org_id   = _org_id
      and m.user_id  = auth.uid()
      and m.role::text = any(_roles)
  );
$$;


--
-- Name: log_search(text, text, boolean, integer, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_search(p_query text, p_mode text, p_has_embedding boolean, p_results_count integer, p_top_result_id uuid, p_org_id uuid, p_catalog_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  insert into public.search_logs(
    query,
    mode,
    has_embedding,
    results_count,
    top_result_id,
    org_id,
    catalog_id
  )
  values (
    p_query,
    p_mode,
    p_has_embedding,
    p_results_count,
    p_top_result_id,
    p_org_id,
    p_catalog_id
  );
$$;


--
-- Name: search_expand_query(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_expand_query(q text) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  nq text := public.search_normalize(q);
  tq text := public.search_simple_translit(q);
  ex text[];
begin
  select expansions into ex
  from public.search_synonyms
  where public.search_normalize(term) = nq
  limit 1;

  if ex is null then
    select expansions into ex
    from public.search_synonyms
    where public.search_normalize(term) = tq
    limit 1;
  end if;

  if ex is null then
    return nq;
  end if;

  -- join original + expansions into one “bag of words”
  return trim(both from (nq || ' ' || array_to_string(ex, ' ')));
end;
$$;


--
-- Name: search_faq(text, extensions.halfvec, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_faq(p_query text, p_query_embedding extensions.halfvec DEFAULT NULL::extensions.halfvec, p_limit integer DEFAULT 5) RETURNS TABLE(id uuid, question text, answer text, category text, score double precision)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      f.id,
      f.question,
      f.answer,
      f.category,
      (
        -- FTS rank
        ts_rank_cd(f.fts, websearch_to_tsquery('simple', p_query)) * 1.0
        -- Vector similarity (higher = better match)
        + CASE
            WHEN p_query_embedding IS NULL OR f.embedding IS NULL THEN 0
            ELSE (1.0 / (1.0 + (f.embedding <=> p_query_embedding))) * 1.5
          END
      ) AS score
    FROM public.faq f
    WHERE f.is_active = true
      AND (
        f.fts @@ websearch_to_tsquery('simple', p_query)
        OR (p_query_embedding IS NOT NULL AND f.embedding IS NOT NULL
            AND f.embedding <=> p_query_embedding < 0.85)
      )
  )
  SELECT s.id, s.question, s.answer, s.category, s.score
  FROM scored s
  ORDER BY s.score DESC
  LIMIT GREATEST(1, LEAST(p_limit, 20));
END;
$$;


--
-- Name: search_normalize(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_normalize(q text) RETURNS text
    LANGUAGE sql IMMUTABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select trim(both from lower(extensions.unaccent(coalesce(q,''))));
$$;


--
-- Name: search_simple_translit(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_simple_translit(q text) RETURNS text
    LANGUAGE sql IMMUTABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select replace(
           replace(
             replace(
               public.search_normalize(q),
               'сув', 'suv'
             ),
             'с', 's'
           ),
           'в', 'v'
         );
$$;


--
-- Name: set_catalog_search_doc_embedding(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_catalog_search_doc_embedding(p_id uuid, p_embedding_text text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  select util.set_catalog_search_doc_embedding(p_id, p_embedding_text);
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: trg_catalog_search_sync_category(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_catalog_search_sync_category() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: trg_catalog_search_sync_category_translation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_catalog_search_sync_category_translation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: trg_catalog_search_sync_item(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_catalog_search_sync_item() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: trg_catalog_search_sync_item_translation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_catalog_search_sync_item_translation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: ack_embedding_job(bigint); Type: FUNCTION; Schema: util; Owner: -
--

CREATE FUNCTION util.ack_embedding_job(p_job_id bigint) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select pgmq.archive('embedding_jobs', p_job_id);
$$;


--
-- Name: clear_column(); Type: FUNCTION; Schema: util; Owner: -
--

CREATE FUNCTION util.clear_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  colname text := tg_argv[0];
begin
  new := new #= hstore(colname, null);
  return new;
end;
$$;


--
-- Name: invoke_edge_function(text, jsonb, integer); Type: FUNCTION; Schema: util; Owner: -
--

CREATE FUNCTION util.invoke_edge_function(name text, body jsonb, timeout_milliseconds integer DEFAULT ((5 * 60) * 1000)) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  headers_raw text;
  auth_header text;
  srk text;
begin
  headers_raw := current_setting('request.headers', true);

  auth_header := case
    when headers_raw is not null then (headers_raw::json->>'authorization')
    else null
  end;

  if auth_header is null then
    srk := util.service_role_key();
    if srk is null or srk = '' then
      raise exception 'Missing Vault secret: service_role_key';
    end if;

    -- Supabase accepts service role key as Bearer + apikey
    auth_header := 'Bearer ' || srk;

    perform net.http_post(
      url => util.project_url() || '/functions/v1/' || name,
      headers => jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', auth_header,
        'apikey', srk
      ),
      body => body,
      timeout_milliseconds => timeout_milliseconds
    );
    return;
  end if;

  -- Normal path (HTTP request context)
  perform net.http_post(
    url => util.project_url() || '/functions/v1/' || name,
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', auth_header
    ),
    body => body,
    timeout_milliseconds => timeout_milliseconds
  );
end;
$$;


--
-- Name: process_embeddings(integer, integer, integer); Type: FUNCTION; Schema: util; Owner: -
--

CREATE FUNCTION util.process_embeddings(batch_size integer DEFAULT 10, max_requests integer DEFAULT 10, timeout_milliseconds integer DEFAULT ((5 * 60) * 1000)) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  job_batches jsonb[];
  batch jsonb;
begin
  with
    numbered_jobs as (
      select
        message || jsonb_build_object('jobId', msg_id) as job_info,
        (row_number() over (order by 1) - 1) / batch_size as batch_num
      from pgmq.read(
        queue_name => 'embedding_jobs',
        vt => timeout_milliseconds / 1000,
        qty => max_requests * batch_size
      )
    ),
    batched_jobs as (
      select
        jsonb_agg(job_info) as batch_array,
        batch_num
      from numbered_jobs
      group by batch_num
    )
  select array_agg(batch_array)
    into job_batches
  from batched_jobs;

  if job_batches is null then
    return;
  end if;

  foreach batch in array job_batches loop
    perform util.invoke_edge_function(
      name => 'embed',
      body => batch,
      timeout_milliseconds => timeout_milliseconds
    );
  end loop;
end;
$$;


--
-- Name: project_url(); Type: FUNCTION; Schema: util; Owner: -
--

CREATE FUNCTION util.project_url() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  secret_value text;
begin
  select decrypted_secret
    into secret_value
  from vault.decrypted_secrets
  where name = 'project_url';

  return secret_value;
end;
$$;


--
-- Name: queue_embeddings(); Type: FUNCTION; Schema: util; Owner: -
--

CREATE FUNCTION util.queue_embeddings() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  content_function text := tg_argv[0];
  embedding_column text := tg_argv[1];
begin
  perform pgmq.send(
    queue_name => 'embedding_jobs',
    msg => jsonb_build_object(
      'id', new.id,
      'schema', tg_table_schema,
      'table', tg_table_name,
      'contentFunction', content_function,
      'embeddingColumn', embedding_column
    )
  );

  return new;
end;
$$;


--
-- Name: service_role_key(); Type: FUNCTION; Schema: util; Owner: -
--

CREATE FUNCTION util.service_role_key() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  secret_value text;
begin
  select decrypted_secret
    into secret_value
  from vault.decrypted_secrets
  where name = 'service_role_key';

  return secret_value;
end;
$$;


--
-- Name: set_catalog_search_doc_embedding(uuid, text); Type: FUNCTION; Schema: util; Owner: -
--

CREATE FUNCTION util.set_catalog_search_doc_embedding(p_id uuid, p_embedding_text text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
begin
  update public.catalog_search_documents
  set embedding = (p_embedding_text::extensions.vector(1536))::extensions.halfvec(1536)
  where id = p_id;
end;
$$;


--
-- Name: api_keys; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    org_id uuid NOT NULL,
    name text NOT NULL,
    environment text DEFAULT 'live'::text NOT NULL,
    prefix text NOT NULL,
    last4 text NOT NULL,
    hashed_key text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT api_keys_environment_check CHECK ((environment = ANY (ARRAY['test'::text, 'live'::text])))
);


--
-- Name: checkout_sessions; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.checkout_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id uuid NOT NULL,
    payment_intent_id uuid NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    success_url text,
    cancel_url text,
    return_url text,
    selected_provider_id text,
    selected_attempt_id uuid,
    customer_id uuid,
    public_token text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT checkout_sessions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'completed'::text, 'expired'::text, 'canceled'::text])))
);


--
-- Name: customer_portal_events; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.customer_portal_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_portal_session_id uuid NOT NULL,
    org_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    subscription_id uuid,
    event_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_portal_sessions; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.customer_portal_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    token_hash text NOT NULL,
    status text DEFAULT 'created'::text NOT NULL,
    return_url text,
    flow_type text,
    flow_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_portal_sessions_status_check CHECK ((status = ANY (ARRAY['created'::text, 'used'::text, 'expired'::text, 'revoked'::text])))
);


--
-- Name: customers; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id uuid NOT NULL,
    customer_org_id uuid,
    customer_user_ref text,
    email text,
    phone text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: logs; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.logs (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    environment text,
    level text DEFAULT 'info'::text NOT NULL,
    type text NOT NULL,
    event text NOT NULL,
    provider_id text,
    org_id uuid,
    checkout_session_id uuid,
    payment_intent_id uuid,
    payment_attempt_id uuid,
    public_token text,
    data jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: TABLE logs; Type: COMMENT; Schema: payments; Owner: -
--

COMMENT ON TABLE payments.logs IS 'Production operational logs for payment orchestration and provider integrations.';


--
-- Name: COLUMN logs.type; Type: COMMENT; Schema: payments; Owner: -
--

COMMENT ON COLUMN payments.logs.type IS 'Log stream type (e.g. webhook, checkout_api, uzum, callback_page).';


--
-- Name: debug_logs_id_seq; Type: SEQUENCE; Schema: payments; Owner: -
--

ALTER TABLE payments.logs ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME payments.debug_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: invoices; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id uuid NOT NULL,
    subscription_id uuid NOT NULL,
    amount_due_minor bigint NOT NULL,
    currency text DEFAULT 'UZS'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    billing_period_start timestamp with time zone,
    billing_period_end timestamp with time zone,
    due_at timestamp with time zone,
    paid_at timestamp with time zone,
    payment_intent_id uuid,
    attempt_count integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT invoices_amount_due_minor_check CHECK ((amount_due_minor >= 0)),
    CONSTRAINT invoices_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'paid'::text, 'void'::text, 'uncollectible'::text])))
);


--
-- Name: org_provider_account_secrets; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.org_provider_account_secrets (
    org_provider_account_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    credentials_encrypted jsonb NOT NULL,
    webhook_secret_encrypted jsonb,
    rotation_version integer DEFAULT 1 NOT NULL
);


--
-- Name: org_provider_accounts; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.org_provider_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id uuid NOT NULL,
    environment payments.environment NOT NULL,
    provider_id text NOT NULL,
    status payments.org_provider_account_status NOT NULL,
    display_label text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT org_provider_accounts_fiscalization_metadata_check CHECK (((jsonb_typeof(COALESCE(metadata, '{}'::jsonb)) = 'object'::text) AND ((provider_id <> 'uzum'::text) OR ((NOT (COALESCE(metadata, '{}'::jsonb) ? 'fiscalization'::text)) OR ((jsonb_typeof((COALESCE(metadata, '{}'::jsonb) -> 'fiscalization'::text)) = 'object'::text) AND ((NOT ((COALESCE(metadata, '{}'::jsonb) -> 'fiscalization'::text) ? 'taxIdentity'::text)) OR ((jsonb_typeof(((COALESCE(metadata, '{}'::jsonb) -> 'fiscalization'::text) -> 'taxIdentity'::text)) = 'object'::text) AND (jsonb_typeof((((COALESCE(metadata, '{}'::jsonb) -> 'fiscalization'::text) -> 'taxIdentity'::text) -> 'type'::text)) = 'string'::text) AND (jsonb_typeof((((COALESCE(metadata, '{}'::jsonb) -> 'fiscalization'::text) -> 'taxIdentity'::text) -> 'value'::text)) = 'string'::text) AND ((((COALESCE(metadata, '{}'::jsonb) -> 'fiscalization'::text) -> 'taxIdentity'::text) ->> 'type'::text) = ANY (ARRAY['TIN'::text, 'PINFL'::text])))))))))
);


--
-- Name: org_tax_profiles; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.org_tax_profiles (
    org_id uuid NOT NULL,
    country_iso2 text NOT NULL,
    schema_id uuid NOT NULL,
    tax_identity_type text NOT NULL,
    tax_identity_value text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_tax_profiles_tax_identity_type_check CHECK ((tax_identity_type = ANY (ARRAY['TIN'::text, 'PINFL'::text, 'VAT_ID'::text, 'OTHER'::text])))
);


--
-- Name: payment_attempts; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.payment_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_intent_id uuid NOT NULL,
    provider_id text NOT NULL,
    org_provider_account_id uuid NOT NULL,
    status text DEFAULT 'initialized'::text NOT NULL,
    provider_payment_id text,
    checkout_url text,
    payment_method_id uuid,
    raw_init_response jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT payment_attempts_status_check CHECK ((status = ANY (ARRAY['initialized'::text, 'requires_action'::text, 'processing'::text, 'succeeded'::text, 'failed'::text, 'canceled'::text])))
);


--
-- Name: payment_events; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.payment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    processing_error text,
    provider_id text NOT NULL,
    environment text DEFAULT 'live'::text NOT NULL,
    org_id uuid,
    provider_event_id text,
    provider_payment_id text,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    CONSTRAINT payment_events_environment_check CHECK ((environment = ANY (ARRAY['test'::text, 'live'::text])))
);


--
-- Name: payment_intents; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.payment_intents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id uuid NOT NULL,
    amount_minor bigint NOT NULL,
    currency text DEFAULT 'UZS'::text NOT NULL,
    status text DEFAULT 'requires_payment_method'::text NOT NULL,
    description text,
    order_id text,
    return_url text,
    client_secret text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT payment_intents_amount_minor_check CHECK ((amount_minor >= 0)),
    CONSTRAINT payment_intents_status_check CHECK ((status = ANY (ARRAY['requires_payment_method'::text, 'requires_action'::text, 'processing'::text, 'succeeded'::text, 'failed'::text, 'canceled'::text])))
);


--
-- Name: payment_methods; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_id uuid NOT NULL,
    provider_id text NOT NULL,
    org_provider_account_id uuid NOT NULL,
    type text DEFAULT 'card'::text NOT NULL,
    provider_token text NOT NULL,
    brand text,
    last4 text,
    exp_month integer,
    exp_year integer,
    is_default boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: plan_tax_classifications; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.plan_tax_classifications (
    plan_id uuid NOT NULL,
    schema_id uuid NOT NULL,
    tax_code_entry_id uuid,
    tax_code text NOT NULL,
    package_code text,
    vat_percent numeric(5,2),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: plans; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    amount_minor bigint NOT NULL,
    currency text DEFAULT 'UZS'::text NOT NULL,
    "interval" text DEFAULT 'month'::text NOT NULL,
    interval_count integer DEFAULT 1 NOT NULL,
    trial_days integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT plans_amount_minor_check CHECK ((amount_minor >= 0)),
    CONSTRAINT plans_fiscalization_metadata_check CHECK (((jsonb_typeof(COALESCE(metadata, '{}'::jsonb)) = 'object'::text) AND ((NOT (COALESCE(metadata, '{}'::jsonb) ? 'fiscalization'::text)) OR ((jsonb_typeof((COALESCE(metadata, '{}'::jsonb) -> 'fiscalization'::text)) = 'object'::text) AND ((NOT ((COALESCE(metadata, '{}'::jsonb) -> 'fiscalization'::text) ? 'spic'::text)) OR (jsonb_typeof(((COALESCE(metadata, '{}'::jsonb) -> 'fiscalization'::text) -> 'spic'::text)) = 'string'::text)) AND ((NOT ((COALESCE(metadata, '{}'::jsonb) -> 'fiscalization'::text) ? 'packageCode'::text)) OR (jsonb_typeof(((COALESCE(metadata, '{}'::jsonb) -> 'fiscalization'::text) -> 'packageCode'::text)) = 'string'::text)))))),
    CONSTRAINT plans_interval_check CHECK (("interval" = ANY (ARRAY['day'::text, 'week'::text, 'month'::text, 'year'::text]))),
    CONSTRAINT plans_interval_count_check CHECK ((interval_count >= 1)),
    CONSTRAINT plans_trial_days_check CHECK ((trial_days >= 0))
);


--
-- Name: providers; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.providers (
    id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    display_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    capabilities jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: subscription_events; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.subscription_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    subscription_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    status text DEFAULT 'incomplete'::text NOT NULL,
    default_payment_method_id uuid,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    canceled_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['incomplete'::text, 'incomplete_expired'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'unpaid'::text, 'canceled'::text])))
);


--
-- Name: tax_code_entries; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.tax_code_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registry_id uuid NOT NULL,
    tax_code text NOT NULL,
    package_code text NOT NULL,
    title text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tax_code_registries; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.tax_code_registries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    schema_id uuid NOT NULL,
    name text NOT NULL,
    source text,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tax_schemas; Type: TABLE; Schema: payments; Owner: -
--

CREATE TABLE payments.tax_schemas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    country_iso2 text NOT NULL,
    version text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_authorization_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_authorization_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id text NOT NULL,
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    redirect_uri text NOT NULL,
    code_challenge text NOT NULL,
    challenge_method text DEFAULT 'S256'::text NOT NULL,
    scope text DEFAULT 'openid profile email'::text NOT NULL,
    next_url text,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_authorization_codes_challenge_method CHECK ((challenge_method = 'S256'::text)),
    CONSTRAINT auth_authorization_codes_code_hash_len CHECK ((char_length(code_hash) = 64))
);


--
-- Name: auth_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id text NOT NULL,
    name text NOT NULL,
    redirect_uris text[] DEFAULT '{}'::text[] NOT NULL,
    secret_hash text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_clients_secret_hash_len CHECK ((char_length(secret_hash) = 64))
);


--
-- Name: catalog_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    catalog_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: catalog_category_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_category_translations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    locale text NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: catalog_item_type_feature_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_item_type_feature_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    catalog_id uuid NOT NULL,
    requested_by_user_id uuid NOT NULL,
    product_type public.catalog_item_product_type NOT NULL,
    source text DEFAULT 'create_item_type_modal'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE catalog_item_type_feature_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.catalog_item_type_feature_requests IS 'Demand signals for unsupported catalog item product types requested from dashboard create-item flow.';


--
-- Name: catalog_locales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_locales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    catalog_id uuid NOT NULL,
    locale text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: catalogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalogs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    org_id uuid NOT NULL,
    logo_path text,
    description text,
    tags text[],
    pricing_config jsonb,
    settings_currency jsonb DEFAULT '{}'::jsonb NOT NULL,
    settings_layout jsonb DEFAULT '{}'::jsonb NOT NULL,
    settings_branding jsonb DEFAULT '{}'::jsonb NOT NULL,
    settings_i18n jsonb DEFAULT '{}'::jsonb NOT NULL,
    settings_behavior jsonb DEFAULT '{}'::jsonb NOT NULL,
    status public.catalog_status DEFAULT 'draft'::public.catalog_status NOT NULL
);


--
-- Name: faq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faq (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    category text,
    embedding extensions.halfvec(1536),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fts tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, ((((COALESCE(question, ''::text) || ' '::text) || COALESCE(answer, ''::text)) || ' '::text) || COALESCE(category, ''::text)))) STORED
);


--
-- Name: item_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    bucket text DEFAULT 'public-assets'::text NOT NULL,
    storage_path text NOT NULL,
    kind public.item_media_kind NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    alt text,
    title text,
    mime_type text,
    bytes bigint,
    width integer,
    height integer,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: item_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_translations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    locale text NOT NULL,
    name text NOT NULL,
    description text,
    image_alt text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    catalog_id uuid NOT NULL,
    category_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    price_cents integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    image_path text,
    image_alt text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    product_type public.catalog_item_product_type DEFAULT 'REGULAR'::public.catalog_item_product_type NOT NULL
);


--
-- Name: COLUMN items.product_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.items.product_type IS 'Square-style catalog item product type classification. UI may support only a subset of enum values.';


--
-- Name: organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.role NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    country_iso2 text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    logo_path text,
    CONSTRAINT organizations_country_iso2_check CHECK (((country_iso2 IS NULL) OR (length(country_iso2) = 2)))
);


--
-- Name: search_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_logs (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    query text NOT NULL,
    mode text NOT NULL,
    has_embedding boolean NOT NULL,
    results_count integer NOT NULL,
    top_result_id uuid,
    org_id uuid,
    catalog_id uuid
);


--
-- Name: search_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.search_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.search_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: search_synonyms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_synonyms (
    term text NOT NULL,
    expansions text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: checkout_sessions checkout_sessions_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.checkout_sessions
    ADD CONSTRAINT checkout_sessions_pkey PRIMARY KEY (id);


--
-- Name: customer_portal_events customer_portal_events_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.customer_portal_events
    ADD CONSTRAINT customer_portal_events_pkey PRIMARY KEY (id);


--
-- Name: customer_portal_sessions customer_portal_sessions_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.customer_portal_sessions
    ADD CONSTRAINT customer_portal_sessions_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: logs debug_logs_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.logs
    ADD CONSTRAINT debug_logs_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: org_provider_account_secrets org_provider_account_secrets_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.org_provider_account_secrets
    ADD CONSTRAINT org_provider_account_secrets_pkey PRIMARY KEY (org_provider_account_id);


--
-- Name: org_provider_accounts org_provider_accounts_org_provider_env_unique; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.org_provider_accounts
    ADD CONSTRAINT org_provider_accounts_org_provider_env_unique UNIQUE (org_id, provider_id, environment);


--
-- Name: org_provider_accounts org_provider_accounts_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.org_provider_accounts
    ADD CONSTRAINT org_provider_accounts_pkey PRIMARY KEY (id);


--
-- Name: org_tax_profiles org_tax_profiles_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.org_tax_profiles
    ADD CONSTRAINT org_tax_profiles_pkey PRIMARY KEY (org_id);


--
-- Name: payment_attempts payment_attempts_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.payment_attempts
    ADD CONSTRAINT payment_attempts_pkey PRIMARY KEY (id);


--
-- Name: payment_events payment_events_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.payment_events
    ADD CONSTRAINT payment_events_pkey PRIMARY KEY (id);


--
-- Name: payment_intents payment_intents_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.payment_intents
    ADD CONSTRAINT payment_intents_pkey PRIMARY KEY (id);


--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);


--
-- Name: plan_tax_classifications plan_tax_classifications_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.plan_tax_classifications
    ADD CONSTRAINT plan_tax_classifications_pkey PRIMARY KEY (plan_id);


--
-- Name: plans plans_org_id_code_key; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.plans
    ADD CONSTRAINT plans_org_id_code_key UNIQUE (org_id, code);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: providers providers_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.providers
    ADD CONSTRAINT providers_pkey PRIMARY KEY (id);


--
-- Name: subscription_events subscription_events_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.subscription_events
    ADD CONSTRAINT subscription_events_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: tax_code_entries tax_code_entries_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.tax_code_entries
    ADD CONSTRAINT tax_code_entries_pkey PRIMARY KEY (id);


--
-- Name: tax_code_entries tax_code_entries_registry_id_tax_code_package_code_key; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.tax_code_entries
    ADD CONSTRAINT tax_code_entries_registry_id_tax_code_package_code_key UNIQUE (registry_id, tax_code, package_code);


--
-- Name: tax_code_registries tax_code_registries_org_id_schema_id_name_key; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.tax_code_registries
    ADD CONSTRAINT tax_code_registries_org_id_schema_id_name_key UNIQUE (org_id, schema_id, name);


--
-- Name: tax_code_registries tax_code_registries_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.tax_code_registries
    ADD CONSTRAINT tax_code_registries_pkey PRIMARY KEY (id);


--
-- Name: tax_schemas tax_schemas_code_key; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.tax_schemas
    ADD CONSTRAINT tax_schemas_code_key UNIQUE (code);


--
-- Name: tax_schemas tax_schemas_pkey; Type: CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.tax_schemas
    ADD CONSTRAINT tax_schemas_pkey PRIMARY KEY (id);


--
-- Name: auth_authorization_codes auth_authorization_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_authorization_codes
    ADD CONSTRAINT auth_authorization_codes_pkey PRIMARY KEY (id);


--
-- Name: auth_clients auth_clients_client_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_clients
    ADD CONSTRAINT auth_clients_client_id_key UNIQUE (client_id);


--
-- Name: auth_clients auth_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_clients
    ADD CONSTRAINT auth_clients_pkey PRIMARY KEY (id);


--
-- Name: catalog_categories catalog_categories_catalog_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_categories
    ADD CONSTRAINT catalog_categories_catalog_slug_unique UNIQUE (catalog_id, slug);


--
-- Name: catalog_categories catalog_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_categories
    ADD CONSTRAINT catalog_categories_pkey PRIMARY KEY (id);


--
-- Name: catalog_category_translations catalog_category_translations_category_id_locale_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_category_translations
    ADD CONSTRAINT catalog_category_translations_category_id_locale_key UNIQUE (category_id, locale);


--
-- Name: catalog_category_translations catalog_category_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_category_translations
    ADD CONSTRAINT catalog_category_translations_pkey PRIMARY KEY (id);


--
-- Name: catalog_item_type_feature_requests catalog_item_type_feature_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_item_type_feature_requests
    ADD CONSTRAINT catalog_item_type_feature_requests_pkey PRIMARY KEY (id);


--
-- Name: catalog_locales catalog_locales_catalog_id_locale_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_locales
    ADD CONSTRAINT catalog_locales_catalog_id_locale_key UNIQUE (catalog_id, locale);


--
-- Name: catalog_locales catalog_locales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_locales
    ADD CONSTRAINT catalog_locales_pkey PRIMARY KEY (id);


--
-- Name: catalog_search_documents catalog_search_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_search_documents
    ADD CONSTRAINT catalog_search_documents_pkey PRIMARY KEY (id);


--
-- Name: catalogs catalogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogs
    ADD CONSTRAINT catalogs_pkey PRIMARY KEY (id);


--
-- Name: catalogs catalogs_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogs
    ADD CONSTRAINT catalogs_slug_key UNIQUE (slug);


--
-- Name: faq faq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faq
    ADD CONSTRAINT faq_pkey PRIMARY KEY (id);


--
-- Name: item_media item_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_media
    ADD CONSTRAINT item_media_pkey PRIMARY KEY (id);


--
-- Name: item_translations item_translations_item_id_locale_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_translations
    ADD CONSTRAINT item_translations_item_id_locale_key UNIQUE (item_id, locale);


--
-- Name: item_translations item_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_translations
    ADD CONSTRAINT item_translations_pkey PRIMARY KEY (id);


--
-- Name: items items_catalog_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_catalog_slug_unique UNIQUE (catalog_id, slug);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: organization_members organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: search_logs search_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_logs
    ADD CONSTRAINT search_logs_pkey PRIMARY KEY (id);


--
-- Name: search_synonyms search_synonyms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_synonyms
    ADD CONSTRAINT search_synonyms_pkey PRIMARY KEY (term);


--
-- Name: api_keys_org_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX api_keys_org_idx ON payments.api_keys USING btree (org_id);


--
-- Name: checkout_sessions_intent_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX checkout_sessions_intent_idx ON payments.checkout_sessions USING btree (payment_intent_id);


--
-- Name: checkout_sessions_org_created_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX checkout_sessions_org_created_idx ON payments.checkout_sessions USING btree (org_id, created_at DESC);


--
-- Name: checkout_sessions_public_token_unique; Type: INDEX; Schema: payments; Owner: -
--

CREATE UNIQUE INDEX checkout_sessions_public_token_unique ON payments.checkout_sessions USING btree (public_token);


--
-- Name: customer_portal_events_customer_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX customer_portal_events_customer_idx ON payments.customer_portal_events USING btree (customer_id, created_at DESC);


--
-- Name: customer_portal_events_event_type_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX customer_portal_events_event_type_idx ON payments.customer_portal_events USING btree (event_type, created_at DESC);


--
-- Name: customer_portal_events_session_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX customer_portal_events_session_idx ON payments.customer_portal_events USING btree (customer_portal_session_id, created_at DESC);


--
-- Name: customer_portal_events_subscription_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX customer_portal_events_subscription_idx ON payments.customer_portal_events USING btree (subscription_id, created_at DESC);


--
-- Name: customer_portal_sessions_customer_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX customer_portal_sessions_customer_idx ON payments.customer_portal_sessions USING btree (customer_id, created_at DESC);


--
-- Name: customer_portal_sessions_expires_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX customer_portal_sessions_expires_idx ON payments.customer_portal_sessions USING btree (expires_at);


--
-- Name: customer_portal_sessions_token_hash_unique; Type: INDEX; Schema: payments; Owner: -
--

CREATE UNIQUE INDEX customer_portal_sessions_token_hash_unique ON payments.customer_portal_sessions USING btree (token_hash);


--
-- Name: customers_org_customer_org_unique; Type: INDEX; Schema: payments; Owner: -
--

CREATE UNIQUE INDEX customers_org_customer_org_unique ON payments.customers USING btree (org_id, customer_org_id) WHERE (customer_org_id IS NOT NULL);


--
-- Name: customers_org_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX customers_org_idx ON payments.customers USING btree (org_id);


--
-- Name: debug_logs_created_at_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX debug_logs_created_at_idx ON payments.logs USING btree (created_at DESC);


--
-- Name: debug_logs_payment_attempt_id_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX debug_logs_payment_attempt_id_idx ON payments.logs USING btree (payment_attempt_id);


--
-- Name: debug_logs_payment_intent_id_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX debug_logs_payment_intent_id_idx ON payments.logs USING btree (payment_intent_id);


--
-- Name: debug_logs_public_token_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX debug_logs_public_token_idx ON payments.logs USING btree (public_token);


--
-- Name: invoices_org_created_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX invoices_org_created_idx ON payments.invoices USING btree (org_id, created_at DESC);


--
-- Name: invoices_payment_intent_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX invoices_payment_intent_idx ON payments.invoices USING btree (payment_intent_id);


--
-- Name: invoices_subscription_created_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX invoices_subscription_created_idx ON payments.invoices USING btree (subscription_id, created_at DESC);


--
-- Name: invoices_subscription_period_unique; Type: INDEX; Schema: payments; Owner: -
--

CREATE UNIQUE INDEX invoices_subscription_period_unique ON payments.invoices USING btree (subscription_id, billing_period_start, billing_period_end) WHERE ((billing_period_start IS NOT NULL) AND (billing_period_end IS NOT NULL));


--
-- Name: invoices_subscription_status_created_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX invoices_subscription_status_created_idx ON payments.invoices USING btree (subscription_id, status, created_at DESC);


--
-- Name: logs_created_at_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX logs_created_at_idx ON payments.logs USING btree (created_at DESC);


--
-- Name: logs_payment_attempt_id_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX logs_payment_attempt_id_idx ON payments.logs USING btree (payment_attempt_id);


--
-- Name: logs_payment_intent_id_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX logs_payment_intent_id_idx ON payments.logs USING btree (payment_intent_id);


--
-- Name: logs_public_token_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX logs_public_token_idx ON payments.logs USING btree (public_token);


--
-- Name: payment_attempts_intent_created_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX payment_attempts_intent_created_idx ON payments.payment_attempts USING btree (payment_intent_id, created_at DESC);


--
-- Name: payment_attempts_provider_lookup_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX payment_attempts_provider_lookup_idx ON payments.payment_attempts USING btree (provider_id, provider_payment_id);


--
-- Name: payment_attempts_provider_payment_unique; Type: INDEX; Schema: payments; Owner: -
--

CREATE UNIQUE INDEX payment_attempts_provider_payment_unique ON payments.payment_attempts USING btree (provider_id, provider_payment_id) WHERE (provider_payment_id IS NOT NULL);


--
-- Name: payment_events_lookup_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX payment_events_lookup_idx ON payments.payment_events USING btree (provider_id, provider_payment_id);


--
-- Name: payment_events_org_received_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX payment_events_org_received_idx ON payments.payment_events USING btree (org_id, received_at DESC);


--
-- Name: payment_events_provider_event_unique; Type: INDEX; Schema: payments; Owner: -
--

CREATE UNIQUE INDEX payment_events_provider_event_unique ON payments.payment_events USING btree (provider_id, provider_event_id) WHERE (provider_event_id IS NOT NULL);


--
-- Name: payment_intents_order_id_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX payment_intents_order_id_idx ON payments.payment_intents USING btree (order_id);


--
-- Name: payment_intents_org_created_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX payment_intents_org_created_idx ON payments.payment_intents USING btree (org_id, created_at DESC);


--
-- Name: payment_methods_customer_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX payment_methods_customer_idx ON payments.payment_methods USING btree (customer_id);


--
-- Name: payment_methods_provider_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX payment_methods_provider_idx ON payments.payment_methods USING btree (provider_id, org_provider_account_id);


--
-- Name: plan_tax_classifications_entry_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX plan_tax_classifications_entry_idx ON payments.plan_tax_classifications USING btree (tax_code_entry_id);


--
-- Name: plan_tax_classifications_schema_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX plan_tax_classifications_schema_idx ON payments.plan_tax_classifications USING btree (schema_id);


--
-- Name: plans_fiscal_package_code_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX plans_fiscal_package_code_idx ON payments.plans USING btree ((((COALESCE(metadata, '{}'::jsonb) -> 'fiscalization'::text) ->> 'packageCode'::text)));


--
-- Name: plans_fiscal_spic_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX plans_fiscal_spic_idx ON payments.plans USING btree ((((COALESCE(metadata, '{}'::jsonb) -> 'fiscalization'::text) ->> 'spic'::text)));


--
-- Name: plans_org_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX plans_org_idx ON payments.plans USING btree (org_id);


--
-- Name: subscription_events_sub_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX subscription_events_sub_idx ON payments.subscription_events USING btree (subscription_id, created_at DESC);


--
-- Name: subscriptions_customer_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX subscriptions_customer_idx ON payments.subscriptions USING btree (customer_id);


--
-- Name: subscriptions_customer_plan_status_updated_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX subscriptions_customer_plan_status_updated_idx ON payments.subscriptions USING btree (org_id, customer_id, plan_id, status, updated_at DESC, created_at DESC);


--
-- Name: subscriptions_org_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX subscriptions_org_idx ON payments.subscriptions USING btree (org_id, created_at DESC);


--
-- Name: subscriptions_plan_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX subscriptions_plan_idx ON payments.subscriptions USING btree (plan_id);


--
-- Name: tax_code_entries_registry_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX tax_code_entries_registry_idx ON payments.tax_code_entries USING btree (registry_id);


--
-- Name: tax_code_entries_tax_code_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX tax_code_entries_tax_code_idx ON payments.tax_code_entries USING btree (tax_code);


--
-- Name: tax_code_registries_org_idx; Type: INDEX; Schema: payments; Owner: -
--

CREATE INDEX tax_code_registries_org_idx ON payments.tax_code_registries USING btree (org_id);


--
-- Name: auth_authorization_codes_client_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_authorization_codes_client_id_idx ON public.auth_authorization_codes USING btree (client_id);


--
-- Name: auth_authorization_codes_code_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_authorization_codes_code_hash_idx ON public.auth_authorization_codes USING btree (code_hash);


--
-- Name: auth_authorization_codes_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_authorization_codes_expires_at_idx ON public.auth_authorization_codes USING btree (expires_at);


--
-- Name: catalog_item_type_feature_requests_catalog_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_item_type_feature_requests_catalog_type_idx ON public.catalog_item_type_feature_requests USING btree (catalog_id, product_type, created_at DESC);


--
-- Name: catalog_item_type_feature_requests_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_item_type_feature_requests_type_idx ON public.catalog_item_type_feature_requests USING btree (product_type, created_at DESC);


--
-- Name: catalog_item_type_feature_requests_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX catalog_item_type_feature_requests_unique ON public.catalog_item_type_feature_requests USING btree (org_id, catalog_id, requested_by_user_id, product_type);


--
-- Name: catalog_one_default_locale; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX catalog_one_default_locale ON public.catalog_locales USING btree (catalog_id) WHERE is_default;


--
-- Name: catalog_search_documents_catalog_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_search_documents_catalog_id_idx ON public.catalog_search_documents USING btree (catalog_id);


--
-- Name: catalog_search_documents_description_trgm_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_search_documents_description_trgm_gin ON public.catalog_search_documents USING gin (description extensions.gin_trgm_ops);


--
-- Name: catalog_search_documents_embedding_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_search_documents_embedding_hnsw ON public.catalog_search_documents USING hnsw (embedding extensions.halfvec_cosine_ops);


--
-- Name: catalog_search_documents_fts_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_search_documents_fts_gin ON public.catalog_search_documents USING gin (fts);


--
-- Name: catalog_search_documents_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_search_documents_org_id_idx ON public.catalog_search_documents USING btree (org_id);


--
-- Name: catalog_search_documents_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_search_documents_source_idx ON public.catalog_search_documents USING btree (source_table, source_id);


--
-- Name: catalog_search_documents_tags_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_search_documents_tags_gin ON public.catalog_search_documents USING gin (tags);


--
-- Name: catalog_search_documents_title_trgm_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_search_documents_title_trgm_gin ON public.catalog_search_documents USING gin (title extensions.gin_trgm_ops);


--
-- Name: catalog_search_documents_unique_source_global; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX catalog_search_documents_unique_source_global ON public.catalog_search_documents USING btree (source_table, source_id) WHERE (catalog_id IS NULL);


--
-- Name: catalog_search_documents_unique_source_in_catalog; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX catalog_search_documents_unique_source_in_catalog ON public.catalog_search_documents USING btree (catalog_id, source_table, source_id) WHERE (catalog_id IS NOT NULL);


--
-- Name: faq_embedding_hnsw_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faq_embedding_hnsw_idx ON public.faq USING hnsw (embedding extensions.halfvec_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: faq_fts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faq_fts_idx ON public.faq USING gin (fts);


--
-- Name: item_media_item_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_media_item_kind_idx ON public.item_media USING btree (item_id, kind);


--
-- Name: item_media_item_pos_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_media_item_pos_idx ON public.item_media USING btree (item_id, "position");


--
-- Name: item_media_one_primary_per_item; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX item_media_one_primary_per_item ON public.item_media USING btree (item_id) WHERE is_primary;


--
-- Name: org_members_unique_user_per_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_members_unique_user_per_org ON public.organization_members USING btree (org_id, user_id);


--
-- Name: organization_members_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_members_org_id_idx ON public.organization_members USING btree (org_id);


--
-- Name: organization_members_org_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_members_org_user_unique ON public.organization_members USING btree (org_id, user_id);


--
-- Name: organization_members_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_members_user_id_idx ON public.organization_members USING btree (user_id);


--
-- Name: catalog_search_documents clear_catalog_search_documents_embedding_on_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clear_catalog_search_documents_embedding_on_update BEFORE UPDATE ON public.catalog_search_documents FOR EACH ROW WHEN ((public.catalog_search_documents_embedding_input(old.*) IS DISTINCT FROM public.catalog_search_documents_embedding_input(new.*))) EXECUTE FUNCTION util.clear_column('embedding');


--
-- Name: catalog_search_documents embed_catalog_search_documents_on_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER embed_catalog_search_documents_on_insert AFTER INSERT ON public.catalog_search_documents FOR EACH ROW WHEN ((NULLIF(public.catalog_search_documents_embedding_input(new.*), ''::text) IS NOT NULL)) EXECUTE FUNCTION util.queue_embeddings('catalog_search_documents_embedding_input', 'embedding');


--
-- Name: catalog_search_documents embed_catalog_search_documents_on_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER embed_catalog_search_documents_on_update AFTER UPDATE ON public.catalog_search_documents FOR EACH ROW WHEN (((public.catalog_search_documents_embedding_input(old.*) IS DISTINCT FROM public.catalog_search_documents_embedding_input(new.*)) AND (NULLIF(public.catalog_search_documents_embedding_input(new.*), ''::text) IS NOT NULL))) EXECUTE FUNCTION util.queue_embeddings('catalog_search_documents_embedding_input', 'embedding');


--
-- Name: catalog_search_documents set_catalog_search_documents_fts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_catalog_search_documents_fts BEFORE INSERT OR UPDATE ON public.catalog_search_documents FOR EACH ROW EXECUTE FUNCTION public.catalog_search_documents_set_fts();


--
-- Name: catalog_search_documents set_catalog_search_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_catalog_search_documents_updated_at BEFORE UPDATE ON public.catalog_search_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: faq set_faq_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_faq_updated_at BEFORE UPDATE ON public.faq FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: catalog_categories trg_catalog_search_sync_category; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_catalog_search_sync_category AFTER INSERT OR DELETE OR UPDATE ON public.catalog_categories FOR EACH ROW EXECUTE FUNCTION public.trg_catalog_search_sync_category();


--
-- Name: catalog_category_translations trg_catalog_search_sync_category_translation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_catalog_search_sync_category_translation AFTER INSERT OR DELETE OR UPDATE ON public.catalog_category_translations FOR EACH ROW EXECUTE FUNCTION public.trg_catalog_search_sync_category_translation();


--
-- Name: items trg_catalog_search_sync_item; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_catalog_search_sync_item AFTER INSERT OR DELETE OR UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.trg_catalog_search_sync_item();


--
-- Name: item_translations trg_catalog_search_sync_item_translation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_catalog_search_sync_item_translation AFTER INSERT OR DELETE OR UPDATE ON public.item_translations FOR EACH ROW EXECUTE FUNCTION public.trg_catalog_search_sync_item_translation();


--
-- Name: catalog_category_translations trg_category_translations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_category_translations_updated_at BEFORE UPDATE ON public.catalog_category_translations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: item_translations trg_item_translations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_item_translations_updated_at BEFORE UPDATE ON public.item_translations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: api_keys api_keys_org_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.api_keys
    ADD CONSTRAINT api_keys_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: checkout_sessions checkout_sessions_customer_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.checkout_sessions
    ADD CONSTRAINT checkout_sessions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES payments.customers(id) ON DELETE SET NULL;


--
-- Name: checkout_sessions checkout_sessions_org_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.checkout_sessions
    ADD CONSTRAINT checkout_sessions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: checkout_sessions checkout_sessions_payment_intent_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.checkout_sessions
    ADD CONSTRAINT checkout_sessions_payment_intent_id_fkey FOREIGN KEY (payment_intent_id) REFERENCES payments.payment_intents(id) ON DELETE CASCADE;


--
-- Name: checkout_sessions checkout_sessions_selected_attempt_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.checkout_sessions
    ADD CONSTRAINT checkout_sessions_selected_attempt_id_fkey FOREIGN KEY (selected_attempt_id) REFERENCES payments.payment_attempts(id) ON DELETE SET NULL;


--
-- Name: checkout_sessions checkout_sessions_selected_provider_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.checkout_sessions
    ADD CONSTRAINT checkout_sessions_selected_provider_id_fkey FOREIGN KEY (selected_provider_id) REFERENCES payments.providers(id);


--
-- Name: customer_portal_events customer_portal_events_customer_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.customer_portal_events
    ADD CONSTRAINT customer_portal_events_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES payments.customers(id) ON DELETE CASCADE;


--
-- Name: customer_portal_events customer_portal_events_customer_portal_session_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.customer_portal_events
    ADD CONSTRAINT customer_portal_events_customer_portal_session_id_fkey FOREIGN KEY (customer_portal_session_id) REFERENCES payments.customer_portal_sessions(id) ON DELETE CASCADE;


--
-- Name: customer_portal_events customer_portal_events_subscription_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.customer_portal_events
    ADD CONSTRAINT customer_portal_events_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES payments.subscriptions(id) ON DELETE SET NULL;


--
-- Name: customer_portal_sessions customer_portal_sessions_customer_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.customer_portal_sessions
    ADD CONSTRAINT customer_portal_sessions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES payments.customers(id) ON DELETE CASCADE;


--
-- Name: customers customers_customer_org_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.customers
    ADD CONSTRAINT customers_customer_org_id_fkey FOREIGN KEY (customer_org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: customers customers_org_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.customers
    ADD CONSTRAINT customers_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_org_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.invoices
    ADD CONSTRAINT invoices_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_payment_intent_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.invoices
    ADD CONSTRAINT invoices_payment_intent_id_fkey FOREIGN KEY (payment_intent_id) REFERENCES payments.payment_intents(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_subscription_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.invoices
    ADD CONSTRAINT invoices_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES payments.subscriptions(id) ON DELETE CASCADE;


--
-- Name: org_provider_account_secrets org_provider_account_secrets_org_provider_account_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.org_provider_account_secrets
    ADD CONSTRAINT org_provider_account_secrets_org_provider_account_id_fkey FOREIGN KEY (org_provider_account_id) REFERENCES payments.org_provider_accounts(id) ON DELETE CASCADE;


--
-- Name: org_provider_accounts org_provider_accounts_org_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.org_provider_accounts
    ADD CONSTRAINT org_provider_accounts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_provider_accounts org_provider_accounts_provider_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.org_provider_accounts
    ADD CONSTRAINT org_provider_accounts_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES payments.providers(id);


--
-- Name: org_tax_profiles org_tax_profiles_org_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.org_tax_profiles
    ADD CONSTRAINT org_tax_profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_tax_profiles org_tax_profiles_schema_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.org_tax_profiles
    ADD CONSTRAINT org_tax_profiles_schema_id_fkey FOREIGN KEY (schema_id) REFERENCES payments.tax_schemas(id) ON DELETE RESTRICT;


--
-- Name: payment_attempts payment_attempts_org_provider_account_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.payment_attempts
    ADD CONSTRAINT payment_attempts_org_provider_account_id_fkey FOREIGN KEY (org_provider_account_id) REFERENCES payments.org_provider_accounts(id);


--
-- Name: payment_attempts payment_attempts_payment_intent_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.payment_attempts
    ADD CONSTRAINT payment_attempts_payment_intent_id_fkey FOREIGN KEY (payment_intent_id) REFERENCES payments.payment_intents(id) ON DELETE CASCADE;


--
-- Name: payment_attempts payment_attempts_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.payment_attempts
    ADD CONSTRAINT payment_attempts_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES payments.payment_methods(id) ON DELETE SET NULL;


--
-- Name: payment_attempts payment_attempts_provider_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.payment_attempts
    ADD CONSTRAINT payment_attempts_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES payments.providers(id);


--
-- Name: payment_events payment_events_org_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.payment_events
    ADD CONSTRAINT payment_events_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: payment_events payment_events_provider_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.payment_events
    ADD CONSTRAINT payment_events_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES payments.providers(id);


--
-- Name: payment_intents payment_intents_org_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.payment_intents
    ADD CONSTRAINT payment_intents_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: payment_methods payment_methods_customer_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.payment_methods
    ADD CONSTRAINT payment_methods_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES payments.customers(id) ON DELETE CASCADE;


--
-- Name: payment_methods payment_methods_org_provider_account_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.payment_methods
    ADD CONSTRAINT payment_methods_org_provider_account_id_fkey FOREIGN KEY (org_provider_account_id) REFERENCES payments.org_provider_accounts(id);


--
-- Name: payment_methods payment_methods_provider_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.payment_methods
    ADD CONSTRAINT payment_methods_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES payments.providers(id);


--
-- Name: plan_tax_classifications plan_tax_classifications_plan_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.plan_tax_classifications
    ADD CONSTRAINT plan_tax_classifications_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES payments.plans(id) ON DELETE CASCADE;


--
-- Name: plan_tax_classifications plan_tax_classifications_schema_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.plan_tax_classifications
    ADD CONSTRAINT plan_tax_classifications_schema_id_fkey FOREIGN KEY (schema_id) REFERENCES payments.tax_schemas(id) ON DELETE RESTRICT;


--
-- Name: plan_tax_classifications plan_tax_classifications_tax_code_entry_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.plan_tax_classifications
    ADD CONSTRAINT plan_tax_classifications_tax_code_entry_id_fkey FOREIGN KEY (tax_code_entry_id) REFERENCES payments.tax_code_entries(id) ON DELETE SET NULL;


--
-- Name: plans plans_org_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.plans
    ADD CONSTRAINT plans_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: subscription_events subscription_events_subscription_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.subscription_events
    ADD CONSTRAINT subscription_events_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES payments.subscriptions(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_customer_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.subscriptions
    ADD CONSTRAINT subscriptions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES payments.customers(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_default_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.subscriptions
    ADD CONSTRAINT subscriptions_default_payment_method_id_fkey FOREIGN KEY (default_payment_method_id) REFERENCES payments.payment_methods(id) ON DELETE SET NULL;


--
-- Name: subscriptions subscriptions_org_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.subscriptions
    ADD CONSTRAINT subscriptions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES payments.plans(id) ON DELETE RESTRICT;


--
-- Name: tax_code_entries tax_code_entries_registry_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.tax_code_entries
    ADD CONSTRAINT tax_code_entries_registry_id_fkey FOREIGN KEY (registry_id) REFERENCES payments.tax_code_registries(id) ON DELETE CASCADE;


--
-- Name: tax_code_registries tax_code_registries_org_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.tax_code_registries
    ADD CONSTRAINT tax_code_registries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tax_code_registries tax_code_registries_schema_id_fkey; Type: FK CONSTRAINT; Schema: payments; Owner: -
--

ALTER TABLE ONLY payments.tax_code_registries
    ADD CONSTRAINT tax_code_registries_schema_id_fkey FOREIGN KEY (schema_id) REFERENCES payments.tax_schemas(id) ON DELETE RESTRICT;


--
-- Name: auth_authorization_codes auth_authorization_codes_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_authorization_codes
    ADD CONSTRAINT auth_authorization_codes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.auth_clients(client_id) ON DELETE CASCADE;


--
-- Name: auth_authorization_codes auth_authorization_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_authorization_codes
    ADD CONSTRAINT auth_authorization_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: catalog_categories catalog_categories_catalog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_categories
    ADD CONSTRAINT catalog_categories_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES public.catalogs(id) ON DELETE CASCADE;


--
-- Name: catalog_category_translations catalog_category_translations_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_category_translations
    ADD CONSTRAINT catalog_category_translations_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.catalog_categories(id) ON DELETE CASCADE;


--
-- Name: catalog_item_type_feature_requests catalog_item_type_feature_requests_catalog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_item_type_feature_requests
    ADD CONSTRAINT catalog_item_type_feature_requests_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES public.catalogs(id) ON DELETE CASCADE;


--
-- Name: catalog_locales catalog_locales_catalog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_locales
    ADD CONSTRAINT catalog_locales_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES public.catalogs(id) ON DELETE CASCADE;


--
-- Name: catalog_search_documents catalog_search_documents_catalog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_search_documents
    ADD CONSTRAINT catalog_search_documents_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES public.catalogs(id) ON DELETE CASCADE;


--
-- Name: catalog_search_documents catalog_search_documents_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_search_documents
    ADD CONSTRAINT catalog_search_documents_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: catalogs catalogs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogs
    ADD CONSTRAINT catalogs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: item_media item_media_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_media
    ADD CONSTRAINT item_media_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: item_translations item_translations_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_translations
    ADD CONSTRAINT item_translations_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: items items_catalog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES public.catalogs(id) ON DELETE CASCADE;


--
-- Name: items items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.catalog_categories(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: org_provider_accounts Enable read access for all users; Type: POLICY; Schema: payments; Owner: -
--

CREATE POLICY "Enable read access for all users" ON payments.org_provider_accounts TO dashboard_user, pgbouncer, authenticated, anon, service_role, supabase_admin, authenticator, supabase_auth_admin, supabase_storage_admin, supabase_replication_admin, supabase_read_only_user, supabase_realtime_admin, postgres, supabase_etl_admin USING (true);


--
-- Name: customer_portal_events; Type: ROW SECURITY; Schema: payments; Owner: -
--

ALTER TABLE payments.customer_portal_events ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_portal_events customer_portal_events_org_isolation; Type: POLICY; Schema: payments; Owner: -
--

CREATE POLICY customer_portal_events_org_isolation ON payments.customer_portal_events USING ((EXISTS ( SELECT 1
   FROM public.organization_members m
  WHERE ((m.org_id = customer_portal_events.org_id) AND (m.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_members m
  WHERE ((m.org_id = customer_portal_events.org_id) AND (m.user_id = auth.uid())))));


--
-- Name: customer_portal_sessions; Type: ROW SECURITY; Schema: payments; Owner: -
--

ALTER TABLE payments.customer_portal_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_portal_sessions customer_portal_sessions_org_isolation; Type: POLICY; Schema: payments; Owner: -
--

CREATE POLICY customer_portal_sessions_org_isolation ON payments.customer_portal_sessions USING ((EXISTS ( SELECT 1
   FROM public.organization_members m
  WHERE ((m.org_id = customer_portal_sessions.org_id) AND (m.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_members m
  WHERE ((m.org_id = customer_portal_sessions.org_id) AND (m.user_id = auth.uid())))));


--
-- Name: invoices invoices_org_isolation; Type: POLICY; Schema: payments; Owner: -
--

CREATE POLICY invoices_org_isolation ON payments.invoices USING ((EXISTS ( SELECT 1
   FROM public.organization_members m
  WHERE ((m.org_id = invoices.org_id) AND (m.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_members m
  WHERE ((m.org_id = invoices.org_id) AND (m.user_id = auth.uid())))));


--
-- Name: org_provider_accounts; Type: ROW SECURITY; Schema: payments; Owner: -
--

ALTER TABLE payments.org_provider_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: org_tax_profiles; Type: ROW SECURITY; Schema: payments; Owner: -
--

ALTER TABLE payments.org_tax_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: org_tax_profiles org_tax_profiles_org_isolation; Type: POLICY; Schema: payments; Owner: -
--

CREATE POLICY org_tax_profiles_org_isolation ON payments.org_tax_profiles USING ((EXISTS ( SELECT 1
   FROM public.organization_members m
  WHERE ((m.org_id = org_tax_profiles.org_id) AND (m.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_members m
  WHERE ((m.org_id = org_tax_profiles.org_id) AND (m.user_id = auth.uid())))));


--
-- Name: payment_attempts; Type: ROW SECURITY; Schema: payments; Owner: -
--

ALTER TABLE payments.payment_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_tax_classifications; Type: ROW SECURITY; Schema: payments; Owner: -
--

ALTER TABLE payments.plan_tax_classifications ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_tax_classifications plan_tax_classifications_org_isolation; Type: POLICY; Schema: payments; Owner: -
--

CREATE POLICY plan_tax_classifications_org_isolation ON payments.plan_tax_classifications USING ((EXISTS ( SELECT 1
   FROM (payments.plans p
     JOIN public.organization_members m ON ((m.org_id = p.org_id)))
  WHERE ((p.id = plan_tax_classifications.plan_id) AND (m.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (payments.plans p
     JOIN public.organization_members m ON ((m.org_id = p.org_id)))
  WHERE ((p.id = plan_tax_classifications.plan_id) AND (m.user_id = auth.uid())))));


--
-- Name: plans plans_org_isolation; Type: POLICY; Schema: payments; Owner: -
--

CREATE POLICY plans_org_isolation ON payments.plans USING ((EXISTS ( SELECT 1
   FROM public.organization_members m
  WHERE ((m.org_id = plans.org_id) AND (m.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_members m
  WHERE ((m.org_id = plans.org_id) AND (m.user_id = auth.uid())))));


--
-- Name: subscriptions subscriptions_org_isolation; Type: POLICY; Schema: payments; Owner: -
--

CREATE POLICY subscriptions_org_isolation ON payments.subscriptions USING ((EXISTS ( SELECT 1
   FROM public.organization_members m
  WHERE ((m.org_id = subscriptions.org_id) AND (m.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_members m
  WHERE ((m.org_id = subscriptions.org_id) AND (m.user_id = auth.uid())))));


--
-- Name: tax_code_entries; Type: ROW SECURITY; Schema: payments; Owner: -
--

ALTER TABLE payments.tax_code_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_code_entries tax_code_entries_org_isolation; Type: POLICY; Schema: payments; Owner: -
--

CREATE POLICY tax_code_entries_org_isolation ON payments.tax_code_entries USING ((EXISTS ( SELECT 1
   FROM (payments.tax_code_registries r
     JOIN public.organization_members m ON ((m.org_id = r.org_id)))
  WHERE ((r.id = tax_code_entries.registry_id) AND (m.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (payments.tax_code_registries r
     JOIN public.organization_members m ON ((m.org_id = r.org_id)))
  WHERE ((r.id = tax_code_entries.registry_id) AND (m.user_id = auth.uid())))));


--
-- Name: tax_code_registries; Type: ROW SECURITY; Schema: payments; Owner: -
--

ALTER TABLE payments.tax_code_registries ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_code_registries tax_code_registries_org_isolation; Type: POLICY; Schema: payments; Owner: -
--

CREATE POLICY tax_code_registries_org_isolation ON payments.tax_code_registries USING ((EXISTS ( SELECT 1
   FROM public.organization_members m
  WHERE ((m.org_id = tax_code_registries.org_id) AND (m.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_members m
  WHERE ((m.org_id = tax_code_registries.org_id) AND (m.user_id = auth.uid())))));


--
-- Name: tax_schemas; Type: ROW SECURITY; Schema: payments; Owner: -
--

ALTER TABLE payments.tax_schemas ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_schemas tax_schemas_read_all; Type: POLICY; Schema: payments; Owner: -
--

CREATE POLICY tax_schemas_read_all ON payments.tax_schemas FOR SELECT USING (true);


--
-- Name: faq Enable all access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for all users" ON public.faq USING (true);


--
-- Name: auth_authorization_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_authorization_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_clients ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_category_translations cat_translations_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cat_translations_delete ON public.catalog_category_translations FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.catalog_categories cc
  WHERE ((cc.id = catalog_category_translations.category_id) AND public.is_org_role(public.catalog_org_id(cc.catalog_id), ARRAY['owner'::text, 'admin'::text])))));


--
-- Name: catalog_category_translations cat_translations_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cat_translations_insert ON public.catalog_category_translations FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.catalog_categories cc
  WHERE ((cc.id = catalog_category_translations.category_id) AND public.is_org_role(public.catalog_org_id(cc.catalog_id), ARRAY['owner'::text, 'admin'::text])))));


--
-- Name: catalog_category_translations cat_translations_select_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cat_translations_select_anon ON public.catalog_category_translations FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.catalog_categories cc
  WHERE ((cc.id = catalog_category_translations.category_id) AND (cc.is_active = true) AND public.catalog_is_public(cc.catalog_id)))));


--
-- Name: catalog_category_translations cat_translations_select_authed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cat_translations_select_authed ON public.catalog_category_translations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.catalog_categories cc
  WHERE ((cc.id = catalog_category_translations.category_id) AND (((cc.is_active = true) AND public.catalog_is_public(cc.catalog_id)) OR public.is_org_role(public.catalog_org_id(cc.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text]))))));


--
-- Name: catalog_category_translations cat_translations_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cat_translations_update ON public.catalog_category_translations FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.catalog_categories cc
  WHERE ((cc.id = catalog_category_translations.category_id) AND public.is_org_role(public.catalog_org_id(cc.catalog_id), ARRAY['owner'::text, 'admin'::text]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.catalog_categories cc
  WHERE ((cc.id = catalog_category_translations.category_id) AND public.is_org_role(public.catalog_org_id(cc.catalog_id), ARRAY['owner'::text, 'admin'::text])))));


--
-- Name: catalog_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_category_translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.catalog_category_translations ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_item_type_feature_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.catalog_item_type_feature_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_locales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.catalog_locales ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_locales catalog_locales_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_locales_delete ON public.catalog_locales FOR DELETE TO authenticated USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));


--
-- Name: catalog_locales catalog_locales_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_locales_insert ON public.catalog_locales FOR INSERT TO authenticated WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));


--
-- Name: catalog_locales catalog_locales_select_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_locales_select_anon ON public.catalog_locales FOR SELECT TO anon USING (public.catalog_is_public(catalog_id));


--
-- Name: catalog_locales catalog_locales_select_authed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_locales_select_authed ON public.catalog_locales FOR SELECT TO authenticated USING ((public.catalog_is_public(catalog_id) OR public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])));


--
-- Name: catalog_locales catalog_locales_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_locales_update ON public.catalog_locales FOR UPDATE TO authenticated USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text])) WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));


--
-- Name: catalog_search_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.catalog_search_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: catalogs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.catalogs ENABLE ROW LEVEL SECURITY;

--
-- Name: catalogs catalogs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalogs_insert ON public.catalogs FOR INSERT TO authenticated WITH CHECK (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));


--
-- Name: catalogs catalogs_select_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalogs_select_anon ON public.catalogs FOR SELECT TO anon USING ((status = 'published'::public.catalog_status));


--
-- Name: catalogs catalogs_select_authed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalogs_select_authed ON public.catalogs FOR SELECT TO authenticated USING (((status = 'published'::public.catalog_status) OR public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])));


--
-- Name: catalogs catalogs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalogs_update ON public.catalogs FOR UPDATE TO authenticated USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text])) WITH CHECK ((public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]) AND (status = ANY (ARRAY['draft'::public.catalog_status, 'published'::public.catalog_status]))));


--
-- Name: catalog_categories categories_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_insert ON public.catalog_categories FOR INSERT TO authenticated WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));


--
-- Name: catalog_categories categories_select_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_select_anon ON public.catalog_categories FOR SELECT TO anon USING (((is_active = true) AND public.catalog_is_public(catalog_id)));


--
-- Name: catalog_categories categories_select_authed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_select_authed ON public.catalog_categories FOR SELECT TO authenticated USING ((((is_active = true) AND public.catalog_is_public(catalog_id)) OR public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])));


--
-- Name: catalog_categories categories_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_update ON public.catalog_categories FOR UPDATE TO authenticated USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text])) WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));


--
-- Name: faq; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faq ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_item_type_feature_requests feature_req_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY feature_req_insert_self ON public.catalog_item_type_feature_requests FOR INSERT TO authenticated WITH CHECK (((requested_by_user_id = auth.uid()) AND public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])));


--
-- Name: catalog_item_type_feature_requests feature_req_select_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY feature_req_select_org ON public.catalog_item_type_feature_requests FOR SELECT TO authenticated USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]));


--
-- Name: item_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_media ENABLE ROW LEVEL SECURITY;

--
-- Name: item_media item_media_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_media_delete ON public.item_media FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = item_media.item_id) AND public.is_org_role(public.catalog_org_id(i.catalog_id), ARRAY['owner'::text, 'admin'::text])))));


--
-- Name: item_media item_media_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_media_insert ON public.item_media FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = item_media.item_id) AND public.is_org_role(public.catalog_org_id(i.catalog_id), ARRAY['owner'::text, 'admin'::text])))));


--
-- Name: item_media item_media_select_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_media_select_anon ON public.item_media FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = item_media.item_id) AND (i.is_active = true) AND public.catalog_is_public(i.catalog_id)))));


--
-- Name: item_media item_media_select_authed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_media_select_authed ON public.item_media FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = item_media.item_id) AND (((i.is_active = true) AND public.catalog_is_public(i.catalog_id)) OR public.is_org_role(public.catalog_org_id(i.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text]))))));


--
-- Name: item_media item_media_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_media_update ON public.item_media FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = item_media.item_id) AND public.is_org_role(public.catalog_org_id(i.catalog_id), ARRAY['owner'::text, 'admin'::text]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = item_media.item_id) AND public.is_org_role(public.catalog_org_id(i.catalog_id), ARRAY['owner'::text, 'admin'::text])))));


--
-- Name: item_translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_translations ENABLE ROW LEVEL SECURITY;

--
-- Name: item_translations item_translations_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_translations_delete ON public.item_translations FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = item_translations.item_id) AND public.is_org_role(public.catalog_org_id(i.catalog_id), ARRAY['owner'::text, 'admin'::text])))));


--
-- Name: item_translations item_translations_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_translations_insert ON public.item_translations FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = item_translations.item_id) AND public.is_org_role(public.catalog_org_id(i.catalog_id), ARRAY['owner'::text, 'admin'::text])))));


--
-- Name: item_translations item_translations_select_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_translations_select_anon ON public.item_translations FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = item_translations.item_id) AND (i.is_active = true) AND public.catalog_is_public(i.catalog_id)))));


--
-- Name: item_translations item_translations_select_authed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_translations_select_authed ON public.item_translations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = item_translations.item_id) AND (((i.is_active = true) AND public.catalog_is_public(i.catalog_id)) OR public.is_org_role(public.catalog_org_id(i.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text]))))));


--
-- Name: item_translations item_translations_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_translations_update ON public.item_translations FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = item_translations.item_id) AND public.is_org_role(public.catalog_org_id(i.catalog_id), ARRAY['owner'::text, 'admin'::text]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = item_translations.item_id) AND public.is_org_role(public.catalog_org_id(i.catalog_id), ARRAY['owner'::text, 'admin'::text])))));


--
-- Name: items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

--
-- Name: items items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY items_insert ON public.items FOR INSERT TO authenticated WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));


--
-- Name: items items_select_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY items_select_anon ON public.items FOR SELECT TO anon USING (((is_active = true) AND public.catalog_is_public(catalog_id)));


--
-- Name: items items_select_authed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY items_select_authed ON public.items FOR SELECT TO authenticated USING ((((is_active = true) AND public.catalog_is_public(catalog_id)) OR public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])));


--
-- Name: items items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY items_update ON public.items FOR UPDATE TO authenticated USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text])) WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));


--
-- Name: organizations org_select_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_select_members ON public.organizations FOR SELECT TO authenticated USING (public.is_org_role(id, ARRAY['owner'::text, 'admin'::text, 'member'::text]));


--
-- Name: organizations org_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_update_owner ON public.organizations FOR UPDATE TO authenticated USING (public.is_org_role(id, ARRAY['owner'::text])) WITH CHECK (public.is_org_role(id, ARRAY['owner'::text]));


--
-- Name: organization_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_members orgmembers_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orgmembers_delete_owner ON public.organization_members FOR DELETE TO authenticated USING (public.is_org_role(org_id, ARRAY['owner'::text]));


--
-- Name: organization_members orgmembers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orgmembers_insert ON public.organization_members FOR INSERT TO authenticated WITH CHECK (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));


--
-- Name: organization_members orgmembers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orgmembers_select ON public.organization_members FOR SELECT TO authenticated USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]));


--
-- Name: organization_members orgmembers_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orgmembers_update_owner ON public.organization_members FOR UPDATE TO authenticated USING (public.is_org_role(org_id, ARRAY['owner'::text])) WITH CHECK (public.is_org_role(org_id, ARRAY['owner'::text]));


--
-- Name: catalog_search_documents search_docs_select_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY search_docs_select_anon ON public.catalog_search_documents FOR SELECT TO anon USING (public.catalog_is_public(catalog_id));


--
-- Name: catalog_search_documents search_docs_select_authed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY search_docs_select_authed ON public.catalog_search_documents FOR SELECT TO authenticated USING ((public.catalog_is_public(catalog_id) OR public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])));


--
-- Name: search_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: search_synonyms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.search_synonyms ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--
