-- KRA — per-catalog QR code style.
--
-- New `settings_qr_style` jsonb column on public.catalogs, mirroring the
-- existing settings_currency / settings_layout / settings_behavior /
-- settings_delivery pattern. Holds the merchant's "QR studio" configuration:
-- foreground/background colors, optional gradient, module + eye shapes,
-- optional logo (storage path), optional frame text, and optional wordmark
-- override. Empty {} normalizes to the legacy monochrome-with-Krafta-wordmark
-- default in lib/qr/config.ts.
--
-- Additive, NOT NULL DEFAULT '{}', no backfill — existing catalogs simply
-- render with the legacy defaults until the merchant opens the studio and
-- saves a styled config.

-- Idempotent because the dev Supabase branch may already have the column
-- applied out-of-band via the management API while we iterated on the
-- studio. `IF NOT EXISTS` lets the next push re-apply safely on prod
-- without erroring on the already-applied dev branch.

ALTER TABLE public.catalogs
  ADD COLUMN IF NOT EXISTS settings_qr_style jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.catalogs.settings_qr_style IS
  'QR studio config: { moduleShape, eyeOuterShape, eyeInnerShape, fgColor, bgColor, fgGradient, logo, frame, wordmark }. Empty {} = legacy monochrome + Krafta wordmark.';
