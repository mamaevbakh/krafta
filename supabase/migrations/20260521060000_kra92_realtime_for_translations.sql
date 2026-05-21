-- KRA-92 / S2 — enable Supabase realtime on translation tables.
--
-- The localization workbench subscribes to live postgres_changes events
-- so the merchant sees the AI working in real time:
--
--   * public.item_translations  — INSERT when the worker writes a fresh
--                                  translation, UPDATE when a merchant
--                                  edits one. Drives the % counter
--                                  tick-up + per-row highlight in the
--                                  workbench's Items tab.
--   * public.translation_jobs   — INSERT (new queued job) + UPDATE on
--                                  status transitions (queued →
--                                  processing → done | failed). Drives
--                                  the "AI translating into X…" pulse
--                                  indicator in the panel header.
--
-- Tables aren't part of `supabase_realtime` by default — without this
-- the client subscribes successfully but no events arrive. ALTER
-- PUBLICATION is wrapped in DO blocks that swallow `duplicate_object`
-- so re-running the migration is a no-op (precedent:
-- 20260508060000_kra32_realtime_for_orders.sql).
--
-- RLS still gates which rows the subscriber sees. The translation
-- tables had their policies installed in
-- 20260521030002_kra90_localization_rls.sql; nothing here changes
-- access semantics — it just exposes the change stream.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.item_translations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.translation_jobs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
