-- KRA-32 — enable Supabase realtime on commerce.orders and friends.
--
-- Tables aren't part of `supabase_realtime` by default; without this the
-- merchant dashboard can't subscribe to live order events. We need:
--   * commerce.orders          (state changes: open → completed | canceled)
--   * commerce.fulfillments    (fulfillment.state moves: proposed → reserved
--                               → prepared → completed; surfaces accept/
--                               ready transitions in the UI)
--   * commerce.order_line_items (qty/total edits from staff)
--   * commerce.order_payments   (payment captured / refunded)
--
-- ALTER PUBLICATION is idempotent enough to run safely; in case the table
-- was already added (manually via Dashboard, say), wrap in DO blocks that
-- swallow `duplicate_object` so re-running is a no-op.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE commerce.orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE commerce.fulfillments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE commerce.order_line_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE commerce.order_payments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
