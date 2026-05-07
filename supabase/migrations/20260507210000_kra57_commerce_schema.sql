-- KRA-57 / Migration 4 — commerce schema bootstrap.
--
-- Per ADR 0001 (`docs/adr/0001-orders-catalog-schema-v1.md` §3.2):
--   * New `commerce` schema for orders + line items + applied_*.
--   * Snapshot pattern: every line/modifier/tax/discount stores both the
--     catalog ref + version AND materialized name/price. Catalog edits
--     never silently change historical orders.
--   * Order state machine draft -> open -> completed | canceled with
--     monotonic `version` for OCC.
--
-- Conventions:
--   * Denormalized `org_id` on every child row for fast one-hop RLS.
--   * Sync trigger keeps org_id consistent with the parent order.
--   * orders.guest_session_id / table_session_id are columns now; FKs are
--     added in Migration 5 once those tables exist.
--   * Plain ASCII in COMMENT strings.

-- ===========================================================================
-- 1. Schema + grants
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS commerce;

GRANT USAGE ON SCHEMA commerce TO authenticated, anon, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA commerce
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

COMMENT ON SCHEMA commerce IS
  'Transactional order pipeline. Distinct from public (catalog content) and payments (Krafta SaaS billing). See ADR 0001.';

-- ===========================================================================
-- 2. Enums
-- ===========================================================================

CREATE TYPE commerce.customer_creation_source AS ENUM (
  'instant_profile',
  'dashboard',
  'guest_checkout',
  'tg_login'
);

CREATE TYPE commerce.order_state AS ENUM ('draft', 'open', 'completed', 'canceled');

CREATE TYPE commerce.order_source AS ENUM ('web', 'tma', 'qr_scan', 'dashboard');

-- Tax/discount types on the order side: simpler than the catalog enum
-- because order rows are always concrete (no "variable_*" — the cashier
-- already entered the value).
CREATE TYPE commerce.order_tax_type AS ENUM ('percentage', 'fixed');
CREATE TYPE commerce.order_discount_type AS ENUM ('percentage', 'fixed_amount');

CREATE TYPE commerce.applied_scope AS ENUM ('order', 'line_item');

-- ===========================================================================
-- 3. commerce.customers
-- ===========================================================================

CREATE TABLE commerce.customers (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id            uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id           uuid,                                  -- FK to auth.users; null for guests
    given_name        text,
    family_name       text,
    email             text,
    phone             text,
    preferred_locale  text,
    metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    creation_source   commerce.customer_creation_source NOT NULL DEFAULT 'guest_checkout',
    version           bigint      NOT NULL DEFAULT 1,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    -- At least one identifier required (see ADR §3.2).
    CONSTRAINT customers_has_identifier_chk CHECK (
      given_name IS NOT NULL
      OR email IS NOT NULL
      OR phone IS NOT NULL
      OR user_id IS NOT NULL
    )
);

COMMENT ON TABLE commerce.customers IS
  'End-customers of merchants (the diner who orders a coffee). NOT the same as payments.customers (Krafta Pay processor customers) or future billing.customers (Krafta SaaS subscribers). See AGENTS.md.';

CREATE INDEX customers_org_id_idx ON commerce.customers (org_id);
CREATE INDEX customers_user_id_idx ON commerce.customers (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX customers_email_idx ON commerce.customers (email) WHERE email IS NOT NULL;
CREATE INDEX customers_phone_idx ON commerce.customers (phone) WHERE phone IS NOT NULL;

CREATE TRIGGER trg_customers_set_updated_at
  BEFORE UPDATE ON commerce.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_customers_bump_version
  BEFORE UPDATE ON commerce.customers
  FOR EACH ROW EXECUTE FUNCTION public.bump_version();

ALTER TABLE commerce.customers ENABLE ROW LEVEL SECURITY;

-- Org members read/write their org's customers.
CREATE POLICY customers_select_authed ON commerce.customers
  FOR SELECT TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR (user_id IS NOT NULL AND user_id = auth.uid())
  );

CREATE POLICY customers_insert ON commerce.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR (user_id IS NOT NULL AND user_id = auth.uid())
  );

CREATE POLICY customers_update ON commerce.customers
  FOR UPDATE TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text])
    OR (user_id IS NOT NULL AND user_id = auth.uid())
  )
  WITH CHECK (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text])
    OR (user_id IS NOT NULL AND user_id = auth.uid())
  );

CREATE POLICY customers_delete ON commerce.customers
  FOR DELETE TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- ===========================================================================
-- 4. commerce.orders
-- ===========================================================================

CREATE TABLE commerce.orders (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id            uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    venue_id          uuid        NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
    catalog_id        uuid        NOT NULL REFERENCES public.catalogs(id) ON DELETE RESTRICT,
    customer_id       uuid        REFERENCES commerce.customers(id) ON DELETE SET NULL,
    -- table_session_id / guest_session_id FKs are deferred to Migration 5.
    -- The columns exist now so the order shape is stable for the cart layer.
    guest_session_id  uuid,
    table_session_id  uuid,
    state             commerce.order_state NOT NULL DEFAULT 'draft',
    version           bigint      NOT NULL DEFAULT 1,
    reference_id      text,                                  -- merchant-facing order # ('A-021')
    ticket_name       text,                                  -- free-text label ('John for here')
    source            commerce.order_source NOT NULL DEFAULT 'web',
    pricing_options   jsonb       NOT NULL DEFAULT '{"auto_apply_taxes": true}'::jsonb,
    metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    closed_at         timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    -- closed_at must be set iff state is terminal.
    CONSTRAINT orders_closed_at_when_terminal_chk CHECK (
      (state IN ('completed','canceled') AND closed_at IS NOT NULL)
      OR
      (state IN ('draft','open') AND closed_at IS NULL)
    )
);

COMMENT ON TABLE commerce.orders IS
  'Cart-as-draft pattern: orders start in state=draft owned by the customers anon Supabase session, transition to state=open on Make-an-order tap. version is a passive change counter; OCC is enforced at the application layer via WHERE version = $expected.';

CREATE INDEX orders_org_id_state_idx ON commerce.orders (org_id, state);
CREATE INDEX orders_venue_id_state_idx ON commerce.orders (venue_id, state);
CREATE INDEX orders_customer_id_idx ON commerce.orders (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX orders_guest_session_id_idx ON commerce.orders (guest_session_id) WHERE guest_session_id IS NOT NULL;
CREATE INDEX orders_table_session_id_idx ON commerce.orders (table_session_id) WHERE table_session_id IS NOT NULL;

-- Sync org_id + catalog_id from the venue (single source of truth).
CREATE FUNCTION commerce.orders_sync_from_venue() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id uuid;
  v_catalog_id uuid;
BEGIN
  SELECT v.org_id, v.catalog_id INTO v_org_id, v_catalog_id
  FROM public.venues v WHERE v.id = NEW.venue_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'orders.venue_id % does not exist', NEW.venue_id;
  END IF;
  NEW.org_id := v_org_id;
  NEW.catalog_id := v_catalog_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orders_sync_from_venue
  BEFORE INSERT OR UPDATE OF venue_id ON commerce.orders
  FOR EACH ROW EXECUTE FUNCTION commerce.orders_sync_from_venue();

CREATE TRIGGER trg_orders_set_updated_at
  BEFORE UPDATE ON commerce.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_orders_bump_version
  BEFORE UPDATE ON commerce.orders
  FOR EACH ROW EXECUTE FUNCTION public.bump_version();

ALTER TABLE commerce.orders ENABLE ROW LEVEL SECURITY;

-- Org members read all org orders. Customers read their own (via customer_id
-- mapped to user_id on commerce.customers).
CREATE POLICY orders_select_authed ON commerce.orders
  FOR SELECT TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR (
      customer_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM commerce.customers c
        WHERE c.id = orders.customer_id
          AND c.user_id = auth.uid()
      )
    )
  );

-- Customers can create draft orders for themselves.
-- Org members can create orders on behalf of customers (POS).
CREATE POLICY orders_insert ON commerce.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR (
      state = 'draft'
      AND customer_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM commerce.customers c
        WHERE c.id = orders.customer_id
          AND c.user_id = auth.uid()
      )
    )
  );

-- Customers can mutate their own draft orders. Org members mutate any.
CREATE POLICY orders_update ON commerce.orders
  FOR UPDATE TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR (
      state IN ('draft','open')
      AND customer_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM commerce.customers c
        WHERE c.id = orders.customer_id
          AND c.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR (
      state IN ('draft','open')
      AND customer_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM commerce.customers c
        WHERE c.id = orders.customer_id
          AND c.user_id = auth.uid()
      )
    )
  );

CREATE POLICY orders_delete ON commerce.orders
  FOR DELETE TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- ===========================================================================
-- 5. Helper: returns an order's org_id (used by child-row RLS to avoid join).
-- ===========================================================================

CREATE FUNCTION commerce.order_org_id(_order_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT o.org_id FROM commerce.orders o WHERE o.id = _order_id;
$$;

-- And whether the current authenticated user owns the order via customer_id.
CREATE FUNCTION commerce.order_belongs_to_current_user(_order_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM commerce.orders o
    JOIN commerce.customers c ON c.id = o.customer_id
    WHERE o.id = _order_id
      AND c.user_id = auth.uid()
  );
$$;

-- ===========================================================================
-- 6. commerce.order_line_items
-- ===========================================================================

CREATE TABLE commerce.order_line_items (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    uid                 text        NOT NULL,                -- stable ID within order; for applied_* refs
    order_id            uuid        NOT NULL REFERENCES commerce.orders(id) ON DELETE CASCADE,
    org_id              uuid        NOT NULL,                -- denormalized for fast RLS; synced via trigger
    -- Snapshot fields (Square-style: store ref + version + materialized values).
    catalog_item_id     uuid        REFERENCES public.items(id) ON DELETE SET NULL,
    catalog_variation_id uuid       REFERENCES public.item_variations(id) ON DELETE SET NULL,
    catalog_version     bigint,                              -- snapshot version of variation/item
    name                text        NOT NULL,                -- snapshotted item name
    variation_name      text,                                -- snapshotted variation name
    quantity            numeric     NOT NULL DEFAULT 1,
    quantity_unit       text,                                -- 'unit', 'kg', 'lb'
    base_price_cents    integer     NOT NULL DEFAULT 0,
    total_price_cents   integer     NOT NULL DEFAULT 0,      -- (base + modifier_deltas) * quantity
    note                text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- Per-line opt-out of auto-applied order-level taxes/discounts.
    pricing_blocklists  jsonb       NOT NULL DEFAULT '{"blocked_taxes": [], "blocked_discounts": []}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (order_id, uid),
    CHECK (quantity > 0)
);

CREATE INDEX order_line_items_order_id_idx ON commerce.order_line_items (order_id);
CREATE INDEX order_line_items_org_id_idx ON commerce.order_line_items (org_id);

-- Sync org_id from parent order.
CREATE FUNCTION commerce.order_child_sync_org_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM commerce.orders WHERE id = NEW.order_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'order_id % does not exist', NEW.order_id;
  END IF;
  NEW.org_id := v_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_line_items_sync_org_id
  BEFORE INSERT OR UPDATE OF order_id ON commerce.order_line_items
  FOR EACH ROW EXECUTE FUNCTION commerce.order_child_sync_org_id();

CREATE TRIGGER trg_order_line_items_set_updated_at
  BEFORE UPDATE ON commerce.order_line_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE commerce.order_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_line_items_select_authed ON commerce.order_line_items
  FOR SELECT TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR commerce.order_belongs_to_current_user(order_id)
  );

CREATE POLICY order_line_items_write ON commerce.order_line_items
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
-- 7. commerce.order_line_item_modifiers
-- ===========================================================================

CREATE TABLE commerce.order_line_item_modifiers (
    id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    uid                      text        NOT NULL,
    line_item_id             uuid        NOT NULL REFERENCES commerce.order_line_items(id) ON DELETE CASCADE,
    order_id                 uuid        NOT NULL,                                       -- denormalized
    org_id                   uuid        NOT NULL,                                       -- denormalized
    catalog_modifier_id      uuid        REFERENCES public.modifiers(id) ON DELETE SET NULL,
    catalog_version          bigint,
    name                     text        NOT NULL,
    base_price_cents_delta   integer     NOT NULL DEFAULT 0,
    quantity                 integer     NOT NULL DEFAULT 1,
    ordinal                  integer     NOT NULL DEFAULT 0,
    metadata                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    UNIQUE (line_item_id, uid),
    CHECK (quantity > 0)
);

CREATE INDEX order_line_item_modifiers_line_item_id_idx ON commerce.order_line_item_modifiers (line_item_id);
CREATE INDEX order_line_item_modifiers_org_id_idx ON commerce.order_line_item_modifiers (org_id);

-- Sync org_id + order_id from the parent line item.
CREATE FUNCTION commerce.line_item_child_sync_ids() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_order_id uuid;
  v_org_id uuid;
BEGIN
  SELECT li.order_id, li.org_id INTO v_order_id, v_org_id
  FROM commerce.order_line_items li WHERE li.id = NEW.line_item_id;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'line_item_id % does not exist', NEW.line_item_id;
  END IF;
  NEW.order_id := v_order_id;
  NEW.org_id := v_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_line_item_modifiers_sync_ids
  BEFORE INSERT OR UPDATE OF line_item_id ON commerce.order_line_item_modifiers
  FOR EACH ROW EXECUTE FUNCTION commerce.line_item_child_sync_ids();

CREATE TRIGGER trg_order_line_item_modifiers_set_updated_at
  BEFORE UPDATE ON commerce.order_line_item_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE commerce.order_line_item_modifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_line_item_modifiers_select_authed ON commerce.order_line_item_modifiers
  FOR SELECT TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR commerce.order_belongs_to_current_user(order_id)
  );

CREATE POLICY order_line_item_modifiers_write ON commerce.order_line_item_modifiers
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
-- 8. commerce.order_taxes
-- ===========================================================================

CREATE TABLE commerce.order_taxes (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    uid                 text        NOT NULL,
    order_id            uuid        NOT NULL REFERENCES commerce.orders(id) ON DELETE CASCADE,
    org_id              uuid        NOT NULL,                                       -- denormalized
    catalog_tax_id      uuid        REFERENCES public.taxes(id) ON DELETE SET NULL,
    kind                public.tax_kind NOT NULL DEFAULT 'tax',                     -- snapshotted from catalog row
    name                text        NOT NULL,
    type                commerce.order_tax_type NOT NULL,
    percentage          numeric(5,4),
    amount_cents        integer,
    scope               commerce.applied_scope NOT NULL,
    auto_applied        boolean     NOT NULL DEFAULT false,
    applied_money_cents integer     NOT NULL DEFAULT 0,                             -- computed by app
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (order_id, uid),
    -- shape CHECK: percentage XOR amount_cents based on type.
    CONSTRAINT order_taxes_shape_chk CHECK (
      (type = 'percentage' AND percentage IS NOT NULL AND amount_cents IS NULL)
      OR
      (type = 'fixed' AND amount_cents IS NOT NULL AND percentage IS NULL)
    )
);

CREATE INDEX order_taxes_order_id_idx ON commerce.order_taxes (order_id);
CREATE INDEX order_taxes_org_id_idx ON commerce.order_taxes (org_id);

CREATE TRIGGER trg_order_taxes_sync_org_id
  BEFORE INSERT OR UPDATE OF order_id ON commerce.order_taxes
  FOR EACH ROW EXECUTE FUNCTION commerce.order_child_sync_org_id();

CREATE TRIGGER trg_order_taxes_set_updated_at
  BEFORE UPDATE ON commerce.order_taxes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE commerce.order_taxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_taxes_select_authed ON commerce.order_taxes
  FOR SELECT TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR commerce.order_belongs_to_current_user(order_id)
  );

CREATE POLICY order_taxes_write ON commerce.order_taxes
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
-- 9. commerce.order_discounts
-- ===========================================================================

CREATE TABLE commerce.order_discounts (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    uid                 text        NOT NULL,
    order_id            uuid        NOT NULL REFERENCES commerce.orders(id) ON DELETE CASCADE,
    org_id              uuid        NOT NULL,                                       -- denormalized
    catalog_discount_id uuid        REFERENCES public.discounts(id) ON DELETE SET NULL,
    name                text        NOT NULL,
    type                commerce.order_discount_type NOT NULL,
    percentage          numeric(5,4),
    amount_cents        integer,
    scope               commerce.applied_scope NOT NULL,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (order_id, uid),
    CONSTRAINT order_discounts_shape_chk CHECK (
      (type = 'percentage' AND percentage IS NOT NULL AND amount_cents IS NULL)
      OR
      (type = 'fixed_amount' AND amount_cents IS NOT NULL AND percentage IS NULL)
    )
);

CREATE INDEX order_discounts_order_id_idx ON commerce.order_discounts (order_id);
CREATE INDEX order_discounts_org_id_idx ON commerce.order_discounts (org_id);

CREATE TRIGGER trg_order_discounts_sync_org_id
  BEFORE INSERT OR UPDATE OF order_id ON commerce.order_discounts
  FOR EACH ROW EXECUTE FUNCTION commerce.order_child_sync_org_id();

CREATE TRIGGER trg_order_discounts_set_updated_at
  BEFORE UPDATE ON commerce.order_discounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE commerce.order_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_discounts_select_authed ON commerce.order_discounts
  FOR SELECT TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR commerce.order_belongs_to_current_user(order_id)
  );

CREATE POLICY order_discounts_write ON commerce.order_discounts
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
-- 10. commerce.line_item_applied_taxes / line_item_applied_discounts
-- ===========================================================================

CREATE TABLE commerce.line_item_applied_taxes (
    line_item_id        uuid    NOT NULL REFERENCES commerce.order_line_items(id) ON DELETE CASCADE,
    order_tax_uid       text    NOT NULL,
    order_id            uuid    NOT NULL,                                       -- denormalized
    org_id              uuid    NOT NULL,                                       -- denormalized
    applied_money_cents integer NOT NULL DEFAULT 0,
    PRIMARY KEY (line_item_id, order_tax_uid)
);

CREATE INDEX line_item_applied_taxes_order_id_idx ON commerce.line_item_applied_taxes (order_id);

-- Sync order_id + org_id from the parent line item, and validate that the
-- referenced tax uid exists on the same order.
CREATE FUNCTION commerce.applied_tax_validate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_order_id uuid;
  v_org_id uuid;
BEGIN
  SELECT li.order_id, li.org_id INTO v_order_id, v_org_id
  FROM commerce.order_line_items li WHERE li.id = NEW.line_item_id;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'line_item_id % does not exist', NEW.line_item_id;
  END IF;
  NEW.order_id := v_order_id;
  NEW.org_id := v_org_id;
  IF NOT EXISTS (
    SELECT 1 FROM commerce.order_taxes ot
    WHERE ot.order_id = v_order_id AND ot.uid = NEW.order_tax_uid
  ) THEN
    RAISE EXCEPTION 'order_tax_uid % does not exist on order %', NEW.order_tax_uid, v_order_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_line_item_applied_taxes_validate
  BEFORE INSERT OR UPDATE ON commerce.line_item_applied_taxes
  FOR EACH ROW EXECUTE FUNCTION commerce.applied_tax_validate();

ALTER TABLE commerce.line_item_applied_taxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY line_item_applied_taxes_select_authed ON commerce.line_item_applied_taxes
  FOR SELECT TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR commerce.order_belongs_to_current_user(order_id)
  );

CREATE POLICY line_item_applied_taxes_write ON commerce.line_item_applied_taxes
  FOR ALL TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR commerce.order_belongs_to_current_user(order_id)
  )
  WITH CHECK (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR commerce.order_belongs_to_current_user(order_id)
  );

CREATE TABLE commerce.line_item_applied_discounts (
    line_item_id        uuid    NOT NULL REFERENCES commerce.order_line_items(id) ON DELETE CASCADE,
    order_discount_uid  text    NOT NULL,
    order_id            uuid    NOT NULL,
    org_id              uuid    NOT NULL,
    applied_money_cents integer NOT NULL DEFAULT 0,
    PRIMARY KEY (line_item_id, order_discount_uid)
);

CREATE INDEX line_item_applied_discounts_order_id_idx ON commerce.line_item_applied_discounts (order_id);

CREATE FUNCTION commerce.applied_discount_validate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_order_id uuid;
  v_org_id uuid;
BEGIN
  SELECT li.order_id, li.org_id INTO v_order_id, v_org_id
  FROM commerce.order_line_items li WHERE li.id = NEW.line_item_id;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'line_item_id % does not exist', NEW.line_item_id;
  END IF;
  NEW.order_id := v_order_id;
  NEW.org_id := v_org_id;
  IF NOT EXISTS (
    SELECT 1 FROM commerce.order_discounts od
    WHERE od.order_id = v_order_id AND od.uid = NEW.order_discount_uid
  ) THEN
    RAISE EXCEPTION 'order_discount_uid % does not exist on order %', NEW.order_discount_uid, v_order_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_line_item_applied_discounts_validate
  BEFORE INSERT OR UPDATE ON commerce.line_item_applied_discounts
  FOR EACH ROW EXECUTE FUNCTION commerce.applied_discount_validate();

ALTER TABLE commerce.line_item_applied_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY line_item_applied_discounts_select_authed ON commerce.line_item_applied_discounts
  FOR SELECT TO authenticated
  USING (
    public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
    OR commerce.order_belongs_to_current_user(order_id)
  );

CREATE POLICY line_item_applied_discounts_write ON commerce.line_item_applied_discounts
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
-- Grants
-- ===========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON
  commerce.customers,
  commerce.orders,
  commerce.order_line_items,
  commerce.order_line_item_modifiers,
  commerce.order_taxes,
  commerce.order_discounts,
  commerce.line_item_applied_taxes,
  commerce.line_item_applied_discounts
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  commerce.customers,
  commerce.orders,
  commerce.order_line_items,
  commerce.order_line_item_modifiers,
  commerce.order_taxes,
  commerce.order_discounts,
  commerce.line_item_applied_taxes,
  commerce.line_item_applied_discounts
TO service_role;

GRANT EXECUTE ON FUNCTION commerce.order_org_id(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION commerce.order_belongs_to_current_user(uuid) TO authenticated, anon;
