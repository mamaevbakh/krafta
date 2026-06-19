-- KRA — structured delivery-detail columns on the customer address book.
--
-- The address-book redesign (dedicated big-map + details screen) collects
-- подъезд / этаж / домофон as their OWN fields, set after the customer drops a
-- map pin, instead of folding them into the free-text `note`. Dedicated columns
-- power the «под. 2 · эт. 4 · кв. 12» summary line and structured courier
-- routing.
--
-- All nullable text (floor can be «4А», intercom codes carry letters), additive,
-- no backfill — existing rows keep their note-based details, and the order-time
-- snapshot in commerce.fulfillment_delivery_details is untouched.

ALTER TABLE commerce.customer_addresses
  ADD COLUMN entrance text,   -- подъезд
  ADD COLUMN floor    text,   -- этаж
  ADD COLUMN intercom text;   -- домофон (may contain letters)

COMMENT ON COLUMN commerce.customer_addresses.entrance IS 'подъезд (building entrance), set after the map pin';
COMMENT ON COLUMN commerce.customer_addresses.floor    IS 'этаж (floor); free text, e.g. «4» or «4А»';
COMMENT ON COLUMN commerce.customer_addresses.intercom IS 'домофон (intercom code); may contain letters';
