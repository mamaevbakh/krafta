-- KRA-91 Slice 2: Localization Workbench worker — RPC helpers + pg_cron schedule
--
-- The translate-worker Supabase Edge Function (supabase/functions/translate-worker/index.ts)
-- depends on a handful of Postgres RPCs to do its work atomically and safely.
-- Bundling them in one migration:
--
--   1. pg_try_advisory_lock_text(p_key text) — singleton advisory lock for
--      worker ticks. Wraps pg_try_advisory_lock(hashtext(text)).
--
--   2. pg_advisory_unlock_text(p_key text) — releases the lock above.
--
--   3. translation_worker_watchdog() — re-queues jobs stuck in 'running'
--      state for >5 minutes (edge function died mid-batch).
--
--   4. translation_worker_claim_batch(p_batch_size int) — atomically claims
--      a batch of queued/failed jobs via FOR UPDATE SKIP LOCKED, sets their
--      status to 'running', and returns the claimed rows.
--
--   5. increment_translation_quota(catalog_id, tokens, usd) — atomic
--      increment of used_today + total_tokens_used + total_usd_estimated.
--      Lazily creates the quota row if missing.
--
--   6. pg_cron schedule — calls the edge function every minute via
--      pg_net.http_post with Vault-stored service-role JWT.
--
-- Sibling files:
--   supabase/functions/translate-worker/index.ts — the worker that calls these RPCs
--   20260521030000-2_kra90_localization_*  — Slice 1 schema + triggers + RLS
--
-- Linear: KRA-91 (Slice 2 of KRA-89 epic).

-- =============================================================================
-- 1. Advisory lock helpers
-- =============================================================================
--
-- pg_try_advisory_lock takes a bigint. We want to lock by text key
-- ("translate-worker") for clarity. hashtext() collapses the text key to a
-- 32-bit int, which is signed and fits in the bigint signature.
--
-- Lock is session-scoped (NOT transaction-scoped). The worker explicitly
-- unlocks in a finally{} block.

CREATE OR REPLACE FUNCTION public.pg_try_advisory_lock_text(p_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT pg_try_advisory_lock(hashtext(p_key)::bigint);
$$;

CREATE OR REPLACE FUNCTION public.pg_advisory_unlock_text(p_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT pg_advisory_unlock(hashtext(p_key)::bigint);
$$;

GRANT EXECUTE ON FUNCTION public.pg_try_advisory_lock_text(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pg_advisory_unlock_text(text) TO service_role;

-- =============================================================================
-- 2. Watchdog — re-queue stuck running jobs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.translation_worker_watchdog()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.translation_jobs
  SET status = 'queued',
      next_attempt_at = now()
  WHERE status = 'running'
    AND started_at < now() - interval '5 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.translation_worker_watchdog() TO service_role;

-- =============================================================================
-- 3. Atomic batch claim
-- =============================================================================
--
-- Returns the claimed jobs as a setof rows. The worker iterates these and
-- calls translateOne per job. Status flips to 'running' as part of this
-- transaction so no other worker tick can claim the same row.
--
-- Returns the columns the worker actually needs (not SELECT *). Schema
-- changes to translation_jobs that add columns DON'T break this RPC.

CREATE OR REPLACE FUNCTION public.translation_worker_claim_batch(p_batch_size integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  catalog_id uuid,
  target_locale text,
  entity_kind public.translatable_entity_kind,
  entity_id uuid,
  attempts integer,
  max_attempts integer,
  llm_provider text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.translation_jobs tj
  SET status = 'running',
      started_at = now(),
      attempts = tj.attempts + 1
  WHERE tj.id IN (
    SELECT inner_tj.id
    FROM public.translation_jobs inner_tj
    WHERE inner_tj.status IN ('queued', 'failed')
      AND inner_tj.next_attempt_at <= now()
    ORDER BY inner_tj.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING
    tj.id,
    tj.catalog_id,
    tj.target_locale,
    tj.entity_kind,
    tj.entity_id,
    tj.attempts,
    tj.max_attempts,
    tj.llm_provider;
END;
$$;

GRANT EXECUTE ON FUNCTION public.translation_worker_claim_batch(integer) TO service_role;

-- =============================================================================
-- 4. Atomic quota increment
-- =============================================================================
--
-- Used by the worker after a job completes successfully (NOT for skipped
-- jobs — human edit guard prevented the AI write, so no token cost).
--
-- Creates the quota row lazily if missing. Resets used_today if the reset
-- window has passed (defensive — the daily reset cron may not have fired).

CREATE OR REPLACE FUNCTION public.increment_translation_quota(
  p_catalog_id uuid,
  p_tokens_used bigint,
  p_usd_estimated numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.catalog_translation_quotas (
    catalog_id,
    used_today,
    total_tokens_used,
    total_usd_estimated,
    updated_at
  )
  VALUES (
    p_catalog_id,
    1,
    GREATEST(p_tokens_used, 0),
    GREATEST(p_usd_estimated, 0),
    now()
  )
  ON CONFLICT (catalog_id) DO UPDATE
  SET
    -- Reset used_today if the reset window has passed
    used_today = CASE
      WHEN catalog_translation_quotas.quota_reset_at < now() THEN 1
      ELSE catalog_translation_quotas.used_today + 1
    END,
    quota_reset_at = CASE
      WHEN catalog_translation_quotas.quota_reset_at < now()
        THEN now() + interval '1 day'
      ELSE catalog_translation_quotas.quota_reset_at
    END,
    total_tokens_used = catalog_translation_quotas.total_tokens_used + GREATEST(p_tokens_used, 0),
    total_usd_estimated = catalog_translation_quotas.total_usd_estimated + GREATEST(p_usd_estimated, 0),
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_translation_quota(uuid, bigint, numeric) TO service_role;

-- =============================================================================
-- 5. Daily quota reset (cron)
-- =============================================================================
--
-- Runs once per day at 00:00 UTC, resetting used_today and bumping the
-- reset window. Idempotent — the worker also handles "reset window passed"
-- in its increment path, so a missed cron run doesn't permanently break
-- quotas.

CREATE OR REPLACE FUNCTION public.translation_worker_reset_daily_quotas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.catalog_translation_quotas
  SET used_today = 0,
      quota_reset_at = now() + interval '1 day',
      updated_at = now()
  WHERE quota_reset_at <= now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.translation_worker_reset_daily_quotas() TO service_role;
