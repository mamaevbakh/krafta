-- Krafta AI — tenant-scoped hybrid retrieval over agent.doc_chunks.
--
-- Why a database function rather than a query in the agent: the tenant filter
-- has to be impossible to forget. This runs under service_role (the runtime
-- bypasses RLS), so `org_id` is the ONLY thing standing between one café and
-- another café's documents. Keeping it in one function means there is exactly
-- one place to audit, instead of one per call site.
--
-- Hybrid, not pure vector, and the reason is Uzbek. Embeddings are weakest
-- exactly where this product lives: a low-resource language, code-switched
-- with Russian, written in two scripts. Keyword matching catches the literal
-- product name or phone number that a wobbly multilingual embedding misses.
-- Reciprocal Rank Fusion merges the two without needing the scores to be on a
-- comparable scale — the same approach `public.catalog_search_auto` already
-- uses for storefront search.
--
-- Both arms search `content_norm`, which the doc_chunks trigger maintains via
-- agent.search_norm(): lowercased, unaccented, and Cyrillic folded to Latin.
-- That is what makes "Навват" and "Navvat" find the same chunk. The caller
-- must NOT pre-normalise; this function does it so the query text and the
-- indexed text can never drift apart.

set local lock_timeout = '3s';

create or replace function agent.search_chunks(
  p_org_id      uuid,
  p_query       text,
  p_embedding   extensions.halfvec(1536) default null,
  p_agent_id    uuid default null,
  p_limit       int  default 8
)
returns table (
  chunk_id     uuid,
  document_id  uuid,
  title        text,
  content      text,
  lang         text,
  chunk_index  int,
  score        double precision
)
language sql
stable
security definer
set search_path to ''
as $$
  with
  -- RRF constant. 60 is the value from the original Cormack et al. paper and
  -- the one the storefront search already uses; keep them the same so tuning
  -- one teaches you something about the other.
  k as (select 60.0 as v),
  norm as (select agent.search_norm(p_query) as q),
  scoped as (
    select c.*
    from agent.doc_chunks c
    where c.org_id = p_org_id
      and c.retrievable
      and (p_agent_id is null or c.agent_id is null or c.agent_id = p_agent_id)
  ),
  vec as (
    select s.id,
           row_number() over (order by s.embedding operator(extensions.<=>) p_embedding) as rank
    from scoped s
    where p_embedding is not null
      and s.embedding is not null
    order by s.embedding operator(extensions.<=>) p_embedding
    limit greatest(p_limit * 4, 40)
  ),
  kw as (
    select s.id,
           row_number() over (
             order by ts_rank_cd(s.fts, websearch_to_tsquery('simple', (select q from norm))) desc
           ) as rank
    from scoped s, norm
    where norm.q <> ''
      and s.fts @@ websearch_to_tsquery('simple', norm.q)
    limit greatest(p_limit * 4, 40)
  ),
  fused as (
    select coalesce(v.id, w.id) as id,
           coalesce(1.0 / ((select v from k) + v.rank), 0.0)
         + coalesce(1.0 / ((select v from k) + w.rank), 0.0) as score
    from vec v
    full outer join kw w on w.id = v.id
  )
  select c.id, c.document_id, d.title, c.content, c.lang, c.chunk_index, f.score
  from fused f
  join agent.doc_chunks c on c.id = f.id
  join agent.documents  d on d.id = c.document_id
  -- Re-assert the tenant on the way out. The CTE already filtered, so this is
  -- redundant by construction — which is the point: if someone later edits
  -- `scoped`, this line still refuses to emit another org's row.
  where c.org_id = p_org_id
  order by f.score desc, c.chunk_index
  limit p_limit;
$$;

comment on function agent.search_chunks is
  'Tenant-scoped hybrid (vector + keyword, RRF) retrieval over agent.doc_chunks. '
  'SECURITY DEFINER: org_id is the only tenant boundary, asserted twice on purpose. '
  'Normalises the query itself so it always matches the indexed content_norm.';

revoke all on function agent.search_chunks(uuid, text, extensions.halfvec, uuid, int) from public;
grant execute on function agent.search_chunks(uuid, text, extensions.halfvec, uuid, int) to service_role;
