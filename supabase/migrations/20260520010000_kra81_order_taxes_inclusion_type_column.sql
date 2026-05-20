-- KRA-81 / Promote commerce.order_taxes.inclusion_type from metadata-key
-- to a real column.
--
-- KRA-63's follow-up commit stashed inclusion_type in metadata so the
-- distinction between additive ('add on top') and included ('VAT in the
-- price') taxes survived through to order_taxes. That works but it forces
-- reporting queries to jsonb-parse — clean break: real column, real type.

-- 1. Add the column. DEFAULT 'additive' fills existing rows that did not
--    have metadata.inclusion_type set (legacy / pre-KRA-63 rows).
ALTER TABLE commerce.order_taxes
  ADD COLUMN inclusion_type public.tax_inclusion_type NOT NULL DEFAULT 'additive';

COMMENT ON COLUMN commerce.order_taxes.inclusion_type IS
  'additive = added to amount charged. included = baked into subtotal; applied_money_cents is the implicit portion (e.g. UZ VAT 12% extracted from a tax-inclusive menu price). See ADR 0001 + KRA-63.';

-- 2. Backfill from metadata for rows that carry the workaround key.
UPDATE commerce.order_taxes
  SET inclusion_type = (metadata->>'inclusion_type')::public.tax_inclusion_type
  WHERE metadata ? 'inclusion_type';

-- 3. Clean up the metadata workaround key now that data lives on the column.
UPDATE commerce.order_taxes
  SET metadata = metadata - 'inclusion_type'
  WHERE metadata ? 'inclusion_type';
