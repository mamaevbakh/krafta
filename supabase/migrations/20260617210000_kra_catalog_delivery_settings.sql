-- KRA — per-catalog delivery-zone settings.
--
-- Mirrors the other settings_* jsonb columns on public.catalogs. Holds the
-- delivery ORIGIN (the cafe's location), the delivery RADIUS, and a flat FEE,
-- so the storefront checkout can reject out-of-zone delivery addresses and
-- quote a fee. Catalog↔venue is 1:1, so catalog-level delivery config is the
-- venue's zone. The merchant sets these from the dashboard Delivery settings.
--
-- Additive, NOT NULL DEFAULT '{}' (matching settings_currency/behavior), no
-- backfill — an empty object normalizes to "no delivery zone configured".

ALTER TABLE public.catalogs
  ADD COLUMN settings_delivery jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.catalogs.settings_delivery IS
  'Delivery-zone settings: { enabled, originLat, originLng, radiusM, feeCents, minOrderCents }. Empty {} = no zone configured.';
