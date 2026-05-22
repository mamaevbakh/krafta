-- ============================================================================
-- KRA-77 / Ordering flow S4 — orders draft uniqueness + tip cap
-- ============================================================================
--
-- 1. Enforce "one open draft per (customer, venue)" at the DB level. The
--    cart layer already SELECT-then-INSERTs against this assumption; the
--    partial UNIQUE INDEX turns the race-loser into a 23505 we can catch
--    in commerce.findOrCreateDraftForCustomer (lib/cart/orders.ts).
--
-- 2. Cap tip at 50% of the (subtotal + additive fees) on order_payments so
--    a fat-finger 50000 tip never silently goes through. The customer
--    facing copy in errors.tip_too_high explains the cap.
--
-- Concurrency note: CREATE UNIQUE INDEX would normally be CONCURRENTLY,
-- but Supabase wraps each migration file in a transaction and
-- CONCURRENTLY can't run inside one. Krafta's commerce.orders table is
-- small at v1 launch (single-digit thousands of rows max), so the brief
-- ACCESS EXCLUSIVE lock during index build is acceptable. Revisit if
-- this becomes a hot path.
-- ============================================================================

-- ---- Pre-flight dupe scan --------------------------------------------------
--
-- If any (customer_id, venue_id) currently has multiple draft orders, the
-- UNIQUE INDEX would fail with a confusing error. Bail loudly instead so
-- the operator can dedup in the dashboard first.
DO $$
DECLARE
  dupe_count integer;
BEGIN
  SELECT count(*) INTO dupe_count FROM (
    SELECT customer_id, venue_id
    FROM commerce.orders
    WHERE state = 'draft' AND customer_id IS NOT NULL
    GROUP BY customer_id, venue_id
    HAVING count(*) > 1
  ) AS dupes;

  IF dupe_count > 0 THEN
    RAISE EXCEPTION
      'KRA-77 migration: % (customer_id, venue_id) tuples have >1 draft order. Manually close the extras (state=canceled) before re-running.',
      dupe_count;
  END IF;
END$$;

-- ---- Unique index ----------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS orders_one_draft_per_customer_venue_uniq
  ON commerce.orders (customer_id, venue_id)
  WHERE state = 'draft' AND customer_id IS NOT NULL;

COMMENT ON INDEX commerce.orders_one_draft_per_customer_venue_uniq IS
  'KRA-77: at most one draft order per (customer, venue). The cart layer
   uses a SELECT-then-INSERT pattern; race losers catch 23505 and
   re-SELECT the winner''s row.';

-- ---- Tip cap on order_payments ---------------------------------------------
--
-- Half of amount_cents is the cap. Use integer arithmetic
-- (tip_cents * 2 <= amount_cents) to avoid any floating-point fuzz.

ALTER TABLE commerce.order_payments
  ADD CONSTRAINT order_payments_tip_cap_chk
  CHECK (tip_cents * 2 <= amount_cents);

COMMENT ON CONSTRAINT order_payments_tip_cap_chk ON commerce.order_payments IS
  'KRA-77: refuse tips > 50% of (subtotal + additive fees). The cart UI
   shows errors.tip_too_high when this triggers.';
