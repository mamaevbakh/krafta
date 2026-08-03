-- Krafta Pay: itemised invoices, and a features slot on plans.
--
-- WHY
-- ---
-- `payments.invoices` carries a single `amount_due_minor` and nothing else.
-- That was enough while every invoice was "one plan, one price". It stops being
-- enough the moment Krafta Pay bills its own merchants, because a platform-fee
-- invoice is at minimum two numbers the merchant must be able to reconcile
-- separately: the monthly base fee, and a percentage of the volume they
-- actually processed. A merchant who cannot see which half of the bill is which
-- will dispute the whole bill.
--
-- IMMUTABILITY
-- ------------
-- Line items are an evidence record, not a view. The usage figures (volume
-- processed, successful charge count, the rate applied, the cap) are SNAPSHOTTED
-- into `metadata` at period close and never recomputed. A webhook that arrives
-- late and flips one more payment_intent to `succeeded` must not retroactively
-- change a number the merchant has already paid.
--
-- MINOR UNITS
-- -----------
-- `unit_amount_minor` and `amount_minor` follow the repo-wide invariant: major
-- x 100, UZS included. 490,000 UZS is 49000000.

-- ---------------------------------------------------------------------------
-- invoice_line_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payments.invoice_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    invoice_id uuid NOT NULL,
    -- 'base'  — the plan's flat monthly fee for the period being opened.
    -- 'usage' — the metered fee for the period that just closed.
    kind text NOT NULL,
    -- Merchant-facing text, written at close in the merchant's billing language.
    description text NOT NULL,
    quantity numeric NOT NULL DEFAULT 1,
    unit_amount_minor bigint NOT NULL,
    amount_minor bigint NOT NULL,
    -- Stable display order within an invoice (base first, then usage).
    sort_order integer NOT NULL DEFAULT 0,
    -- The usage snapshot lives here: base_minor, successful_charges, rate_bps,
    -- cap_minor, capped, usage_period_start, usage_period_end.
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id),
    CONSTRAINT invoice_line_items_kind_check CHECK (kind IN ('base', 'usage')),
    CONSTRAINT invoice_line_items_quantity_check CHECK (quantity >= 0),
    CONSTRAINT invoice_line_items_unit_amount_check CHECK (unit_amount_minor >= 0),
    CONSTRAINT invoice_line_items_amount_check CHECK (amount_minor >= 0)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_line_items_invoice_id_fkey'
  ) THEN
    ALTER TABLE ONLY payments.invoice_line_items
      ADD CONSTRAINT invoice_line_items_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES payments.invoices(id) ON DELETE CASCADE;
  END IF;
END $$;

-- One line of each kind per invoice. This is what makes line-item creation
-- idempotent: the renewal path can be re-entered (cron overlap, a retried
-- period close) and the second insert is rejected rather than doubling the
-- itemisation under an unchanged invoice total.
CREATE UNIQUE INDEX IF NOT EXISTS invoice_line_items_invoice_kind_unique
  ON payments.invoice_line_items (invoice_id, kind);

-- Invoice detail: every line for one invoice, in display order.
CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_sort_idx
  ON payments.invoice_line_items (invoice_id, sort_order);

COMMENT ON TABLE payments.invoice_line_items IS
  'Itemisation of payments.invoices. Lines sum to invoices.amount_due_minor. Usage figures are snapshotted at period close and never recomputed.';

-- ---------------------------------------------------------------------------
-- plans.features
-- ---------------------------------------------------------------------------
--
-- Feature gating is deliberately NOT implemented here — this migration only
-- gives gating somewhere to read from, so the platform plan rows can declare
-- what each tier unlocks (hosted checkout, coupons, analytics) without a second
-- migration later. `metadata` already exists but is load-bearing for
-- fiscalization on merchant plans; keeping entitlements in their own column
-- means a gating check can never be broken by a fiscal-cart edit.

ALTER TABLE payments.plans
  ADD COLUMN IF NOT EXISTS features jsonb DEFAULT '{}'::jsonb NOT NULL;

COMMENT ON COLUMN payments.plans.features IS
  'Entitlements this plan unlocks. Read by feature gating; not enforced by the billing engine.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- Written and read exclusively by service-role code paths; the dashboard routes
-- authorize org membership in app code before touching them, matching
-- webhook_endpoints / webhook_deliveries. RLS on with no permissive policy, so
-- an anon/authenticated key can never read another merchant's invoice detail.

ALTER TABLE payments.invoice_line_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON payments.invoice_line_items TO service_role;
