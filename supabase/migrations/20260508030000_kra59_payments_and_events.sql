-- KRA-59 / Migration 6 — Order payments + events.
--
-- Per ADR 0001 (`docs/adr/0001-orders-catalog-schema-v1.md` §3.4, §3.5,
-- §7 Q4):
--   * commerce.order_payments — N rows per order (split tender ready for
--     v2). v1 collects 'cash' and 'external_card_recorded' only; the
--     'krafta_pay' enum value lights up later, no migration needed.
--   * Cross-schema FK to payments.payment_intents only when source_type
--     is 'krafta_pay'.
--   * commerce.order_refunds — own resource, refunds are not payments.
--   * commerce.order_events — append-only audit log. RLS denies UPDATE +
--     DELETE so events are immutable.

-- ===========================================================================
-- 1. Enums
-- ===========================================================================

CREATE TYPE commerce.order_payment_status AS ENUM (
  'pending', 'approved', 'completed', 'canceled', 'failed'
);

CREATE TYPE commerce.order_payment_source AS ENUM (
  'cash',
  'external_card_recorded',
  'krafta_pay'
);

CREATE TYPE commerce.order_refund_status AS ENUM ('pending', 'completed', 'failed');

CREATE TYPE commerce.order_event_actor AS ENUM (
  'customer', 'merchant_staff', 'system', 'krafta_admin'
);

-- ===========================================================================
-- 2. commerce.order_payments
-- ===========================================================================

CREATE TABLE commerce.order_payments (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            uuid        NOT NULL REFERENCES commerce.orders(id) ON DELETE RESTRICT,
    org_id              uuid        NOT NULL,                                       -- denormalized
    amount_cents        integer     NOT NULL,
    tip_cents           integer     NOT NULL DEFAULT 0,
    total_cents         integer     NOT NULL,                                       -- amount + tip; app maintains
    currency            text        NOT NULL,                                       -- snapshotted from venue/order
    status              commerce.order_payment_status NOT NULL DEFAULT 'pending',
    source_type         commerce.order_payment_source NOT NULL,
    -- Cross-schema reference to Krafta Pay. Only set when source_type='krafta_pay'.
    krafta_pay_payment_intent_id uuid REFERENCES payments.payment_intents(id) ON DELETE SET NULL,
    source_details      jsonb       NOT NULL DEFAULT '{}'::jsonb,                   -- cash: {collected_at}, etc.
    collected_by_user_id uuid,                                                      -- staff who marked cash collected
    autocomplete        boolean     NOT NULL DEFAULT true,                          -- auth+capture vs auth-only
    version             bigint      NOT NULL DEFAULT 1,
    authorized_at       timestamptz,
    completed_at        timestamptz,
    canceled_at         timestamptz,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    -- Money invariants.
    CONSTRAINT order_payments_amount_nonneg_chk CHECK (amount_cents >= 0),
    CONSTRAINT order_payments_tip_nonneg_chk CHECK (tip_cents >= 0),
    CONSTRAINT order_payments_total_consistent_chk CHECK (total_cents = amount_cents + tip_cents),
    CONSTRAINT order_payments_currency_iso4217_chk CHECK (currency ~ '^[A-Z]{3}$'),
    -- krafta_pay_payment_intent_id is set iff source_type='krafta_pay'.
    CONSTRAINT order_payments_krafta_pay_intent_chk CHECK (
      (source_type = 'krafta_pay' AND krafta_pay_payment_intent_id IS NOT NULL)
      OR
      (source_type <> 'krafta_pay' AND krafta_pay_payment_intent_id IS NULL)
    )
);

COMMENT ON COLUMN commerce.order_payments.source_type IS
  'cash = merchant collected cash in person. external_card_recorded = merchant swiped on their own POS, no money through Krafta (Square EXTERNAL equivalent). krafta_pay = in-app via Krafta Pay (v2+ only; v1 uses cash/external).';
COMMENT ON COLUMN commerce.order_payments.autocomplete IS
  'true = auth+capture in one step (default). false = auth-only, separate capture step (v2 use cases).';

CREATE INDEX order_payments_order_id_idx ON commerce.order_payments (order_id);
CREATE INDEX order_payments_org_id_status_idx ON commerce.order_payments (org_id, status);
CREATE INDEX order_payments_krafta_pay_intent_idx
  ON commerce.order_payments (krafta_pay_payment_intent_id)
  WHERE krafta_pay_payment_intent_id IS NOT NULL;

CREATE TRIGGER trg_order_payments_sync_org_id
  BEFORE INSERT OR UPDATE OF order_id ON commerce.order_payments
  FOR EACH ROW EXECUTE FUNCTION commerce.order_child_sync_org_id();

CREATE TRIGGER trg_order_payments_set_updated_at
  BEFORE UPDATE ON commerce.order_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_order_payments_bump_version
  BEFORE UPDATE ON commerce.order_payments
  FOR EACH ROW EXECUTE FUNCTION public.bump_version();

ALTER TABLE commerce.order_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_payments_select_authed ON commerce.order_payments
  FOR SELECT TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR commerce.order_belongs_to_current_user(order_id)
  );

CREATE POLICY order_payments_insert ON commerce.order_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR commerce.order_belongs_to_current_user(order_id)
  );

CREATE POLICY order_payments_update ON commerce.order_payments
  FOR UPDATE TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]))
  WITH CHECK (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]));

-- Refunds are recorded via INSERT into order_refunds, not by deleting payments.
CREATE POLICY order_payments_no_delete ON commerce.order_payments
  FOR DELETE TO authenticated
  USING (false);

-- ===========================================================================
-- 3. commerce.order_refunds
-- ===========================================================================

CREATE TABLE commerce.order_refunds (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id          uuid        NOT NULL REFERENCES commerce.order_payments(id) ON DELETE RESTRICT,
    order_id            uuid        NOT NULL REFERENCES commerce.orders(id) ON DELETE RESTRICT,
    org_id              uuid        NOT NULL,                                       -- denormalized
    amount_cents        integer     NOT NULL,
    status              commerce.order_refund_status NOT NULL DEFAULT 'pending',
    reason              text,
    refunded_by_user_id uuid,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT order_refunds_amount_nonneg_chk CHECK (amount_cents >= 0)
);

CREATE INDEX order_refunds_payment_id_idx ON commerce.order_refunds (payment_id);
CREATE INDEX order_refunds_order_id_idx ON commerce.order_refunds (order_id);
CREATE INDEX order_refunds_org_id_status_idx ON commerce.order_refunds (org_id, status);

CREATE TRIGGER trg_order_refunds_sync_org_id
  BEFORE INSERT OR UPDATE OF order_id ON commerce.order_refunds
  FOR EACH ROW EXECUTE FUNCTION commerce.order_child_sync_org_id();

CREATE TRIGGER trg_order_refunds_set_updated_at
  BEFORE UPDATE ON commerce.order_refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE commerce.order_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_refunds_select_authed ON commerce.order_refunds
  FOR SELECT TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR commerce.order_belongs_to_current_user(order_id)
  );

-- Only owner/admin can issue refunds.
CREATE POLICY order_refunds_write ON commerce.order_refunds
  FOR ALL TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- ===========================================================================
-- 4. commerce.order_events (append-only)
-- ===========================================================================

CREATE TABLE commerce.order_events (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    uuid        NOT NULL REFERENCES commerce.orders(id) ON DELETE CASCADE,
    org_id      uuid        NOT NULL,                                              -- denormalized
    event_type  text        NOT NULL,                                              -- 'state_change' | 'item_added' | 'modifier_change' | 'fulfillment_state_change' | 'payment_state_change' | 'refund'
    actor_type  commerce.order_event_actor NOT NULL,
    actor_id    uuid,                                                              -- auth.users; null for system events
    before      jsonb,
    after       jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE commerce.order_events IS
  'Append-only audit log. RLS denies UPDATE and DELETE; rows are immutable. Used by KRA-32 dashboard for realtime + reconciliation.';

CREATE INDEX order_events_order_id_occurred_at_idx
  ON commerce.order_events (order_id, occurred_at DESC);
CREATE INDEX order_events_org_id_occurred_at_idx
  ON commerce.order_events (org_id, occurred_at DESC);
CREATE INDEX order_events_event_type_idx ON commerce.order_events (event_type);

CREATE TRIGGER trg_order_events_sync_org_id
  BEFORE INSERT ON commerce.order_events
  FOR EACH ROW EXECUTE FUNCTION commerce.order_child_sync_org_id();

ALTER TABLE commerce.order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_events_select_authed ON commerce.order_events
  FOR SELECT TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR commerce.order_belongs_to_current_user(order_id)
  );

-- INSERT only: any party that can write the order can append events.
CREATE POLICY order_events_insert ON commerce.order_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR commerce.order_belongs_to_current_user(order_id)
  );

-- Append-only: explicitly deny UPDATE and DELETE for everyone.
CREATE POLICY order_events_no_update ON commerce.order_events
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY order_events_no_delete ON commerce.order_events
  FOR DELETE TO authenticated USING (false);

-- ===========================================================================
-- Grants
-- ===========================================================================

-- order_payments / order_refunds: SELECT, INSERT, UPDATE for authenticated;
-- DELETE blocked by RLS on payments + RLS on refunds (only org admin).
GRANT SELECT, INSERT, UPDATE ON
  commerce.order_payments,
  commerce.order_refunds
TO authenticated;

-- order_events: only SELECT + INSERT for authenticated (append-only contract).
GRANT SELECT, INSERT ON commerce.order_events TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  commerce.order_payments,
  commerce.order_refunds,
  commerce.order_events
TO service_role;
