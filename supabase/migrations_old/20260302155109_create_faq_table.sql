-- Pulled from remote migration history (version 20260302155109).
-- Purpose: FAQ knowledge base table + hybrid search RPC.

-- FAQ knowledge base table
CREATE TABLE IF NOT EXISTS public.faq (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question   text NOT NULL,
  answer     text NOT NULL,
  category   text,
  embedding  extensions.halfvec(1536),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for vector similarity search
CREATE INDEX IF NOT EXISTS faq_embedding_hnsw_idx
  ON public.faq
  USING hnsw (embedding extensions.halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text search column + index
ALTER TABLE public.faq ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(question, '') || ' ' || coalesce(answer, '') || ' ' || coalesce(category, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS faq_fts_idx ON public.faq USING gin (fts);

-- Auto-update updated_at
CREATE TRIGGER set_faq_updated_at
  BEFORE UPDATE ON public.faq
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------
-- RPC: search_faq
-- Hybrid search: vector similarity + full-text, returns top N
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_faq(
  p_query          text,
  p_query_embedding halfvec DEFAULT NULL,
  p_limit          int     DEFAULT 5
)
RETURNS TABLE (
  id         uuid,
  question   text,
  answer     text,
  category   text,
  score      double precision
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      f.id,
      f.question,
      f.answer,
      f.category,
      (
        ts_rank_cd(f.fts, websearch_to_tsquery('simple', p_query)) * 1.0
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

