-- Customer-facing delivery fee snapshot on the per-order delivery details.
--
-- The merchant configures a flat delivery fee (catalogs.settings_delivery.feeCents,
-- or, once a courier account is serviceable, a live courier quote). It is charged
-- to the customer (added to order_payments.amount_cents at place-time) and snapshot
-- here so receipts / refunds can isolate the delivery component from item subtotal
-- and taxes. Distinct from the future dispatch_quote_cents (what the courier bills
-- the MERCHANT) — this is what the CUSTOMER paid. 0 = free / no delivery fee.
--
-- Applied to the dev branch via MCP; this file is the source of truth for prod.

ALTER TABLE commerce.fulfillment_delivery_details
  ADD COLUMN IF NOT EXISTS delivery_fee_cents integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN commerce.fulfillment_delivery_details.delivery_fee_cents IS
  'Delivery fee charged to the customer (minor units), snapshot at place-time. 0 = free.';
