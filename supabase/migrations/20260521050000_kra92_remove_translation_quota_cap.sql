-- KRA-92: remove the 500/day translation quota cap.
--
-- ## Background
--
-- Slice 1 (20260521030000) added catalog_translation_quotas with a 500/day
-- default cap and a runaway-guard CHECK constraint (used_today <= daily_quota * 2).
-- Slice 2 (20260521040000) wired checkQuota into enqueue + increment in the
-- worker.
--
-- Founder decided to remove the cap. Translations cost $0.0003 per item with
-- gpt-5-nano (verified by smoke test). At Krafta's scale a cap is solving a
-- non-problem and adds friction merchants don't need.
--
-- ## What this does
--
-- 1. Drop the CHECK (used_today <= daily_quota * 2) constraint — the worker
--    increments used_today on every completed job; with no cap, we don't
--    want a stale "runaway guard" rejecting writes.
-- 2. Drop the CHECK (daily_quota >= 0) constraint — harmless but no longer
--    enforced anywhere (we'll set quota to effectively unlimited).
-- 3. Update existing quota rows to daily_quota = 1_000_000 so they don't
--    show "47/500" with old cap data in any UI that hasn't reloaded.
-- 4. Change the column default to 1_000_000 for new rows.
--
-- The tracking columns (used_today, total_tokens_used, total_usd_estimated)
-- are preserved — merchants still see "47 AI translations today, $0.014
-- spent". Just no hard cap.
--
-- ## How to re-enable enforcement later (if ever)
--
-- 1. Pick a per-tier daily_quota value
-- 2. UPDATE catalog_translation_quotas SET daily_quota = N where ... per tier
-- 3. Re-enable the checkQuota() short-circuit in lib/translation/quota.ts
-- 4. Optionally re-add the CHECK constraint
--
-- Refs: KRA-92 (workbench UI slice); founder feedback.

ALTER TABLE public.catalog_translation_quotas
  DROP CONSTRAINT IF EXISTS catalog_translation_quotas_check,
  DROP CONSTRAINT IF EXISTS catalog_translation_quotas_check1,
  DROP CONSTRAINT IF EXISTS catalog_translation_quotas_check2,
  DROP CONSTRAINT IF EXISTS catalog_translation_quotas_used_today_check,
  DROP CONSTRAINT IF EXISTS catalog_translation_quotas_daily_quota_check;

-- Lift the daily_quota ceiling on existing rows. 1M is the conventional
-- "effectively unlimited" sentinel — high enough that no real catalog will
-- approach it, low enough that an int column overflow is impossible.
UPDATE public.catalog_translation_quotas
SET daily_quota = 1000000,
    updated_at = now()
WHERE daily_quota < 1000000;

-- New rows from now on get 1M by default.
ALTER TABLE public.catalog_translation_quotas
  ALTER COLUMN daily_quota SET DEFAULT 1000000;

COMMENT ON COLUMN public.catalog_translation_quotas.daily_quota IS
  'Soft daily cap on AI translation jobs per catalog. Default 1_000_000 = effectively unlimited (cap removed in KRA-92 migration 20260521050000). Future paid-tier work may re-enable per-tier caps.';
