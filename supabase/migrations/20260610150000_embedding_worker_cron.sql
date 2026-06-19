-- Embedding worker — pg_cron schedule
--
-- Codifies the embedding-queue consumer schedule so it exists on EVERY
-- environment, not just whichever one it was hand-scheduled on.
--
-- Background: the consumer (util.process_embeddings -> 'embed' edge function,
-- defined in 20260101000000_baseline.sql) was scheduled out-of-band on the
-- production project (cron job 'process-embeddings', every 10s) and never
-- committed as a migration. The dev branch project therefore never had a
-- consumer at all: 100% of its catalog_search_documents sat NULL-embedding and
-- the pgmq 'embedding_jobs' queue only grew. This migration makes the schedule
-- reproducible on every ref (dev gains the consumer; prod's existing job is
-- re-asserted idempotently).
--
-- The vector-search arm of public.catalog_search / catalog_search_auto excludes
-- NULL-embedding rows from HNSW matches, so a missing consumer silently degrades
-- search to keyword-fts-only.
--
-- Mirrors the idempotent unschedule-then-schedule pattern from
-- 20260521040001_kra91_translate_worker_cron.sql. The companion fix to the
-- 'embed' edge function (ack orphaned "Document not found" jobs) prevents the
-- poison-message backlog that previously starved live jobs at the queue tail.

DO $$
DECLARE
  v_existing_id bigint;
BEGIN
  SELECT jobid INTO v_existing_id
  FROM cron.job
  WHERE jobname = 'process-embeddings';

  IF v_existing_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'process-embeddings',
  '10 seconds',
  $cron$ SELECT util.process_embeddings(); $cron$
);
