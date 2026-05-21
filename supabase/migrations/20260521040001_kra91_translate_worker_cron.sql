-- KRA-91 Slice 2: Localization Workbench worker — pg_cron schedule
--
-- Schedules the translate-worker edge function to run every minute.
--
-- Uses the existing `util.invoke_edge_function(name, body, timeout_ms)` helper
-- from baseline (lines 980-1029). That helper:
--   - resolves the project URL via util.project_url() (env-specific, no hardcoded URL)
--   - reads the service-role JWT from Vault via util.service_role_key()
--   - POSTs with the correct Authorization + apikey headers
--   - handles timeouts
--
-- This means the migration is environment-agnostic: it works on the dev branch
-- project AND on production with no changes — both projects have the same
-- util.* helpers and their own Vault-stored service-role keys.
--
-- The schedule fires every minute (cron pattern `* * * * *`). Each tick:
--   1. Edge function acquires advisory lock (skips if previous tick still running)
--   2. Watchdog re-queues stuck jobs
--   3. Claims up to 50 jobs, processes in parallel groups of 10
--   4. Marks done/skipped/failed with backoff
--   5. Releases lock
--
-- Daily quota reset: a SEPARATE cron job runs once a day at 00:00 UTC to
-- reset used_today (the worker's increment_translation_quota function ALSO
-- handles "reset window passed" defensively, so a missed daily cron doesn't
-- permanently break quotas).
--
-- Sibling files:
--   supabase/functions/translate-worker/index.ts  — worker entry point
--   20260521040000_kra91_translate_worker_rpcs.sql — claim/watchdog/quota RPCs
--
-- Linear: KRA-91 (Slice 2 of KRA-89 epic).

-- =============================================================================
-- 1. Schedule the worker tick (every minute)
-- =============================================================================
--
-- Idempotent: cron.schedule returns the job id if it exists, and we use
-- unschedule-if-exists to handle re-runs of this migration cleanly.

DO $$
DECLARE
  v_existing_id bigint;
BEGIN
  SELECT jobid INTO v_existing_id
  FROM cron.job
  WHERE jobname = 'translation-worker-tick';

  IF v_existing_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'translation-worker-tick',
  '* * * * *',
  $cron$
    SELECT util.invoke_edge_function(
      'translate-worker',
      '{}'::jsonb,
      60000
    );
  $cron$
);

-- =============================================================================
-- 2. Schedule daily quota reset (00:00 UTC)
-- =============================================================================

DO $$
DECLARE
  v_existing_id bigint;
BEGIN
  SELECT jobid INTO v_existing_id
  FROM cron.job
  WHERE jobname = 'translation-quota-daily-reset';

  IF v_existing_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'translation-quota-daily-reset',
  '0 0 * * *',
  $cron$
    SELECT public.translation_worker_reset_daily_quotas();
  $cron$
);

-- =============================================================================
-- 3. Verification helper
-- =============================================================================

COMMENT ON SCHEMA cron IS
  'Krafta cron jobs:
   - translation-worker-tick      (every minute) — calls translate-worker edge function
   - translation-quota-daily-reset (00:00 UTC daily) — resets catalog_translation_quotas.used_today
   plus any pre-existing jobs from embedding/search infrastructure.';
