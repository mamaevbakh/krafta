-- KRA-58 / Migration 5 — Fulfillments + dine-in sessions.
--
-- Per ADR 0001 (`docs/adr/0001-orders-catalog-schema-v1.md` §3.3, §7 Q7):
--   * Dine-in is a first-class fulfillment type. Krafta-specific gap that
--     Square doesn't fill (their dine-in is bolted on top of pickup).
--   * commerce.table_sessions: shared context for a physical table; one
--     OPEN session per (venue_id, table_label) at a time.
--   * commerce.guest_sessions: one diner inside a table session.
--   * commerce.fulfillments + per-type detail tables (avoid jsonb soup).
--   * Each "Make an order" tap creates a new commerce.orders row in
--     state='open' under the same table_session + guest_session.
--
-- This migration also retro-adds the FKs deferred from Migration 4:
--   * commerce.orders.guest_session_id -> commerce.guest_sessions(id)
--   * commerce.orders.table_session_id -> commerce.table_sessions(id)

-- ===========================================================================
-- 1. Enums
-- ===========================================================================

CREATE TYPE commerce.table_session_status AS ENUM ('open', 'closed');
CREATE TYPE commerce.fulfillment_type AS ENUM ('dine_in', 'pickup', 'delivery', 'digital');
CREATE TYPE commerce.fulfillment_state AS ENUM (
  'proposed', 'reserved', 'prepared', 'completed', 'canceled', 'failed'
);
CREATE TYPE commerce.fulfillment_line_item_application AS ENUM ('all', 'entry_list');

CREATE TYPE commerce.fulfillment_schedule_type AS ENUM ('asap', 'scheduled');
CREATE TYPE commerce.delivery_provider AS ENUM ('merchant', 'yandex', 'glovo', 'other');

-- ===========================================================================
-- 2. commerce.table_sessions
-- ===========================================================================

CREATE TABLE commerce.table_sessions (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid        NOT NULL,                     -- denormalized; synced from venue
    venue_id      uuid        NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
    table_label   text        NOT NULL,                     -- 'Table 5', 'Bar 2'
    qr_code_id    uuid,                                     -- FK to qr_codes (KRA-26) when that lands
    status        commerce.table_session_status NOT NULL DEFAULT 'open',
    metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    opened_at     timestamptz NOT NULL DEFAULT now(),
    closed_at     timestamptz,
    CONSTRAINT table_sessions_closed_at_chk CHECK (
      (status = 'closed' AND closed_at IS NOT NULL)
      OR
      (status = 'open' AND closed_at IS NULL)
    )
);

COMMENT ON TABLE commerce.table_sessions IS
  'Dine-in shared context per physical table. One open session per (venue, table_label) at a time, enforced by partial unique index.';

-- One OPEN session per (venue_id, table_label) at a time.
CREATE UNIQUE INDEX table_sessions_one_open_per_table
  ON commerce.table_sessions (venue_id, table_label)
  WHERE status = 'open';

CREATE INDEX table_sessions_venue_id_idx ON commerce.table_sessions (venue_id);
CREATE INDEX table_sessions_org_id_status_idx ON commerce.table_sessions (org_id, status);

CREATE FUNCTION commerce.table_sessions_sync_org_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.venues WHERE id = NEW.venue_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'table_sessions.venue_id % does not exist', NEW.venue_id;
  END IF;
  NEW.org_id := v_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_table_sessions_sync_org_id
  BEFORE INSERT OR UPDATE OF venue_id ON commerce.table_sessions
  FOR EACH ROW EXECUTE FUNCTION commerce.table_sessions_sync_org_id();

ALTER TABLE commerce.table_sessions ENABLE ROW LEVEL SECURITY;

-- Org members read all org sessions. Anonymous customers (anon Supabase
-- session) read OPEN sessions for venues whose catalog is public; this is
-- how the customer-facing dine-in surface picks up the table context from
-- the QR scan.
CREATE POLICY table_sessions_select_anon ON commerce.table_sessions
  FOR SELECT TO anon
  USING (
    status = 'open'
    AND EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = table_sessions.venue_id
        AND public.catalog_is_public(v.catalog_id)
    )
  );

CREATE POLICY table_sessions_select_authed ON commerce.table_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR (
      status = 'open'
      AND EXISTS (
        SELECT 1 FROM public.venues v
        WHERE v.id = table_sessions.venue_id
          AND public.catalog_is_public(v.catalog_id)
      )
    )
  );

CREATE POLICY table_sessions_write ON commerce.table_sessions
  FOR ALL TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]))
  WITH CHECK (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]));

-- Customers also need to OPEN a session when they scan a QR. Allow INSERT
-- for the anon Supabase authenticated session when no open session exists.
-- (Idempotency / contention is handled by the partial unique index above.)
CREATE POLICY table_sessions_insert_anon_session ON commerce.table_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND status = 'open'
    AND EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = table_sessions.venue_id
        AND public.catalog_is_public(v.catalog_id)
    )
  );

-- ===========================================================================
-- 3. commerce.guest_sessions
-- ===========================================================================

CREATE TABLE commerce.guest_sessions (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    table_session_id uuid        NOT NULL REFERENCES commerce.table_sessions(id) ON DELETE CASCADE,
    org_id           uuid        NOT NULL,                  -- denormalized; synced from table_session
    customer_id      uuid        REFERENCES commerce.customers(id) ON DELETE SET NULL,
    user_id          uuid,                                  -- auth.users (anon Supabase session) for RLS scoping
    display_name     text,                                  -- 'Guest 1', or first name
    metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    joined_at        timestamptz NOT NULL DEFAULT now(),
    left_at          timestamptz
);

CREATE INDEX guest_sessions_table_session_id_idx ON commerce.guest_sessions (table_session_id);
CREATE INDEX guest_sessions_user_id_idx ON commerce.guest_sessions (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX guest_sessions_org_id_idx ON commerce.guest_sessions (org_id);

CREATE FUNCTION commerce.guest_sessions_sync_org_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM commerce.table_sessions WHERE id = NEW.table_session_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'guest_sessions.table_session_id % does not exist', NEW.table_session_id;
  END IF;
  NEW.org_id := v_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guest_sessions_sync_org_id
  BEFORE INSERT OR UPDATE OF table_session_id ON commerce.guest_sessions
  FOR EACH ROW EXECUTE FUNCTION commerce.guest_sessions_sync_org_id();

ALTER TABLE commerce.guest_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY guest_sessions_select_authed ON commerce.guest_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR user_id = auth.uid()
  );

CREATE POLICY guest_sessions_insert ON commerce.guest_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR (user_id IS NOT NULL AND user_id = auth.uid())
  );

CREATE POLICY guest_sessions_update ON commerce.guest_sessions
  FOR UPDATE TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR user_id = auth.uid()
  )
  WITH CHECK (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR user_id = auth.uid()
  );

CREATE POLICY guest_sessions_delete ON commerce.guest_sessions
  FOR DELETE TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- ===========================================================================
-- 4. Add FKs deferred from Migration 4 on commerce.orders
-- ===========================================================================

ALTER TABLE commerce.orders
  ADD CONSTRAINT orders_table_session_id_fkey
    FOREIGN KEY (table_session_id) REFERENCES commerce.table_sessions(id) ON DELETE SET NULL,
  ADD CONSTRAINT orders_guest_session_id_fkey
    FOREIGN KEY (guest_session_id) REFERENCES commerce.guest_sessions(id) ON DELETE SET NULL;

-- ===========================================================================
-- 5. commerce.fulfillments
-- ===========================================================================

CREATE TABLE commerce.fulfillments (
    id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    uid                   text        NOT NULL,                              -- stable ID within order
    order_id              uuid        NOT NULL REFERENCES commerce.orders(id) ON DELETE CASCADE,
    org_id                uuid        NOT NULL,                              -- denormalized
    type                  commerce.fulfillment_type NOT NULL,
    state                 commerce.fulfillment_state NOT NULL DEFAULT 'proposed',
    line_item_application commerce.fulfillment_line_item_application NOT NULL DEFAULT 'all',
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (order_id, uid)
);

CREATE INDEX fulfillments_order_id_idx ON commerce.fulfillments (order_id);
CREATE INDEX fulfillments_org_id_state_idx ON commerce.fulfillments (org_id, state);

CREATE TRIGGER trg_fulfillments_sync_org_id
  BEFORE INSERT OR UPDATE OF order_id ON commerce.fulfillments
  FOR EACH ROW EXECUTE FUNCTION commerce.order_child_sync_org_id();

CREATE TRIGGER trg_fulfillments_set_updated_at
  BEFORE UPDATE ON commerce.fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE commerce.fulfillments ENABLE ROW LEVEL SECURITY;

CREATE POLICY fulfillments_select_authed ON commerce.fulfillments
  FOR SELECT TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR commerce.order_belongs_to_current_user(order_id)
  );

CREATE POLICY fulfillments_write ON commerce.fulfillments
  FOR ALL TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR commerce.order_belongs_to_current_user(order_id)
  )
  WITH CHECK (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR commerce.order_belongs_to_current_user(order_id)
  );

-- ===========================================================================
-- 6. commerce.fulfillment_line_item_entries (only when application = entry_list)
-- ===========================================================================

CREATE TABLE commerce.fulfillment_line_item_entries (
    fulfillment_id  uuid    NOT NULL REFERENCES commerce.fulfillments(id) ON DELETE CASCADE,
    line_item_uid   text    NOT NULL,                                 -- refs commerce.order_line_items.uid
    quantity        numeric NOT NULL DEFAULT 1,
    PRIMARY KEY (fulfillment_id, line_item_uid),
    CHECK (quantity > 0)
);

CREATE INDEX fulfillment_line_item_entries_fulfillment_id_idx
  ON commerce.fulfillment_line_item_entries (fulfillment_id);

ALTER TABLE commerce.fulfillment_line_item_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY fulfillment_line_item_entries_select_authed ON commerce.fulfillment_line_item_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commerce.fulfillments f
      WHERE f.id = fulfillment_line_item_entries.fulfillment_id
        AND (
          public.is_org_role(f.org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
          OR commerce.order_belongs_to_current_user(f.order_id)
        )
    )
  );

CREATE POLICY fulfillment_line_item_entries_write ON commerce.fulfillment_line_item_entries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commerce.fulfillments f
      WHERE f.id = fulfillment_line_item_entries.fulfillment_id
        AND (
          public.is_org_role(f.org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
          OR commerce.order_belongs_to_current_user(f.order_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM commerce.fulfillments f
      WHERE f.id = fulfillment_line_item_entries.fulfillment_id
        AND (
          public.is_org_role(f.org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
          OR commerce.order_belongs_to_current_user(f.order_id)
        )
    )
  );

-- ===========================================================================
-- 7. commerce.fulfillment_dine_in_details
-- ===========================================================================

CREATE TABLE commerce.fulfillment_dine_in_details (
    fulfillment_id    uuid    PRIMARY KEY REFERENCES commerce.fulfillments(id) ON DELETE CASCADE,
    table_session_id  uuid    NOT NULL REFERENCES commerce.table_sessions(id) ON DELETE RESTRICT,
    table_label       text    NOT NULL,                                   -- denormalized for kitchen ticket
    guest_session_id  uuid    NOT NULL REFERENCES commerce.guest_sessions(id) ON DELETE RESTRICT,
    party_size        integer,
    course_number     integer,
    closed_at         timestamptz,                                        -- bill settled
    CHECK (party_size IS NULL OR party_size > 0),
    CHECK (course_number IS NULL OR course_number > 0)
);

ALTER TABLE commerce.fulfillment_dine_in_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY fulfillment_dine_in_details_select_authed ON commerce.fulfillment_dine_in_details
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commerce.fulfillments f
      WHERE f.id = fulfillment_dine_in_details.fulfillment_id
        AND (
          public.is_org_role(f.org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
          OR commerce.order_belongs_to_current_user(f.order_id)
        )
    )
  );

CREATE POLICY fulfillment_dine_in_details_write ON commerce.fulfillment_dine_in_details
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commerce.fulfillments f
      WHERE f.id = fulfillment_dine_in_details.fulfillment_id
        AND (
          public.is_org_role(f.org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
          OR commerce.order_belongs_to_current_user(f.order_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM commerce.fulfillments f
      WHERE f.id = fulfillment_dine_in_details.fulfillment_id
        AND (
          public.is_org_role(f.org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
          OR commerce.order_belongs_to_current_user(f.order_id)
        )
    )
  );

-- ===========================================================================
-- 8. commerce.fulfillment_pickup_details
-- ===========================================================================

CREATE TABLE commerce.fulfillment_pickup_details (
    fulfillment_id        uuid        PRIMARY KEY REFERENCES commerce.fulfillments(id) ON DELETE CASCADE,
    recipient_name        text,
    recipient_phone       text,
    schedule_type         commerce.fulfillment_schedule_type NOT NULL DEFAULT 'asap',
    pickup_at             timestamptz,
    pickup_window_minutes integer,
    prep_time_minutes     integer,
    -- timestamp ladder
    placed_at             timestamptz,
    accepted_at           timestamptz,
    rejected_at           timestamptz,
    ready_at              timestamptz,
    picked_up_at          timestamptz,
    expired_at            timestamptz,
    canceled_at           timestamptz,
    cancel_reason         text,
    is_curbside           boolean     NOT NULL DEFAULT false,
    note                  text,
    CHECK (pickup_window_minutes IS NULL OR pickup_window_minutes > 0),
    CHECK (prep_time_minutes IS NULL OR prep_time_minutes >= 0),
    CHECK (
      schedule_type = 'asap' OR (schedule_type = 'scheduled' AND pickup_at IS NOT NULL)
    )
);

ALTER TABLE commerce.fulfillment_pickup_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY fulfillment_pickup_details_select_authed ON commerce.fulfillment_pickup_details
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commerce.fulfillments f
      WHERE f.id = fulfillment_pickup_details.fulfillment_id
        AND (
          public.is_org_role(f.org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
          OR commerce.order_belongs_to_current_user(f.order_id)
        )
    )
  );

CREATE POLICY fulfillment_pickup_details_write ON commerce.fulfillment_pickup_details
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commerce.fulfillments f
      WHERE f.id = fulfillment_pickup_details.fulfillment_id
        AND (
          public.is_org_role(f.org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
          OR commerce.order_belongs_to_current_user(f.order_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM commerce.fulfillments f
      WHERE f.id = fulfillment_pickup_details.fulfillment_id
        AND (
          public.is_org_role(f.org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
          OR commerce.order_belongs_to_current_user(f.order_id)
        )
    )
  );

-- ===========================================================================
-- 9. commerce.fulfillment_delivery_details
-- ===========================================================================

CREATE TABLE commerce.fulfillment_delivery_details (
    fulfillment_id        uuid        PRIMARY KEY REFERENCES commerce.fulfillments(id) ON DELETE CASCADE,
    recipient_name        text        NOT NULL,
    recipient_phone       text        NOT NULL,
    address               jsonb       NOT NULL,
    scheduled_for         timestamptz,
    delivery_provider     commerce.delivery_provider NOT NULL DEFAULT 'merchant',
    external_courier_ref  text,                                           -- v2 courier integrations (KRA-39)
    -- timestamp ladder
    placed_at             timestamptz,
    accepted_at           timestamptz,
    rejected_at           timestamptz,
    courier_assigned_at   timestamptz,
    picked_up_at          timestamptz,
    delivered_at          timestamptz,
    canceled_at           timestamptz,
    cancel_reason         text,
    note                  text
);

ALTER TABLE commerce.fulfillment_delivery_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY fulfillment_delivery_details_select_authed ON commerce.fulfillment_delivery_details
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commerce.fulfillments f
      WHERE f.id = fulfillment_delivery_details.fulfillment_id
        AND (
          public.is_org_role(f.org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
          OR commerce.order_belongs_to_current_user(f.order_id)
        )
    )
  );

CREATE POLICY fulfillment_delivery_details_write ON commerce.fulfillment_delivery_details
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commerce.fulfillments f
      WHERE f.id = fulfillment_delivery_details.fulfillment_id
        AND (
          public.is_org_role(f.org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
          OR commerce.order_belongs_to_current_user(f.order_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM commerce.fulfillments f
      WHERE f.id = fulfillment_delivery_details.fulfillment_id
        AND (
          public.is_org_role(f.org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
          OR commerce.order_belongs_to_current_user(f.order_id)
        )
    )
  );

-- ===========================================================================
-- Grants
-- ===========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON
  commerce.table_sessions,
  commerce.guest_sessions,
  commerce.fulfillments,
  commerce.fulfillment_line_item_entries,
  commerce.fulfillment_dine_in_details,
  commerce.fulfillment_pickup_details,
  commerce.fulfillment_delivery_details
TO authenticated;

GRANT SELECT ON commerce.table_sessions TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  commerce.table_sessions,
  commerce.guest_sessions,
  commerce.fulfillments,
  commerce.fulfillment_line_item_entries,
  commerce.fulfillment_dine_in_details,
  commerce.fulfillment_pickup_details,
  commerce.fulfillment_delivery_details
TO service_role;
