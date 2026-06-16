-- KRA — customer saved delivery addresses (the address book).
--
-- A storefront customer (the PERSON, identified by auth.uid() — an anonymous
-- web session OR the verified Telegram Mini App identity) can save delivery
-- addresses once and reuse them at checkout.
--
-- Ownership is by auth.uid(), NOT by a per-org commerce.customers row, on
-- purpose: commerce.customers is per (org, user) for order attribution, but a
-- person's home address should follow them to EVERY shop they order from. So
-- the book is global-per-user. The linkIdentity() upgrade path preserves
-- auth.uid(), so addresses survive an anon -> real-account upgrade.
--
-- The order still snapshots the chosen address into
-- commerce.fulfillment_delivery_details at place-time, so editing or deleting
-- a saved address never rewrites order history.
--
-- Geo columns (latitude/longitude/geo_provider) are nullable: the Yandex Maps
-- picker fills them when it lands; manual entry leaves them null.

CREATE TABLE commerce.customer_addresses (
    id            uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    -- auth.uid() of the owner. No FK (auth schema), mirroring
    -- commerce.customers.user_id.
    user_id       uuid             NOT NULL,
    label         text,                              -- "Home", "Work" (optional)
    district      text,                              -- routing-critical in Tashkent
    street        text,
    building      text,
    apartment     text,                              -- flat / office
    note          text,                              -- intercom, floor, landmark
    freeform      text             NOT NULL,         -- composed display string; snapshotted onto the order
    latitude      double precision,
    longitude     double precision,
    geo_provider  text,                              -- 'yandex' once the picker fills coords; null for manual
    is_default    boolean          NOT NULL DEFAULT false,
    metadata      jsonb            NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz      NOT NULL DEFAULT now(),
    updated_at    timestamptz      NOT NULL DEFAULT now()
);

COMMENT ON TABLE commerce.customer_addresses IS
  'Reusable delivery addresses owned by a storefront customer (auth.uid()), global across shops. Distinct from the per-order snapshot in commerce.fulfillment_delivery_details.';

CREATE INDEX customer_addresses_user_id_idx ON commerce.customer_addresses (user_id);

-- At most one default address per user.
CREATE UNIQUE INDEX customer_addresses_one_default_per_user
  ON commerce.customer_addresses (user_id) WHERE is_default;

CREATE TRIGGER trg_customer_addresses_set_updated_at
  BEFORE UPDATE ON commerce.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE commerce.customer_addresses ENABLE ROW LEVEL SECURITY;

-- The book is private to its owner: only the person whose auth.uid() matches
-- user_id can read or write. Merchants read the delivery address from the
-- order snapshot, not from the customer's book, so there is no org-role access.
CREATE POLICY customer_addresses_select ON commerce.customer_addresses
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY customer_addresses_insert ON commerce.customer_addresses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY customer_addresses_update ON commerce.customer_addresses
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY customer_addresses_delete ON commerce.customer_addresses
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON commerce.customer_addresses
  TO authenticated, service_role;
