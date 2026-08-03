-- Krafta Pay: outbound webhooks to merchant systems.
--
-- WHY
-- ---
-- Krafta Pay had zero outbound event delivery. That was survivable while the
-- only client was Krafta Catalogs — same monorepo, same database, so the app
-- could just read `payments.subscriptions` directly. No external merchant can
-- do that. Without outbound webhooks a Telegram bot has no way to learn that a
-- renewal succeeded and access should stay on, short of polling us.
--
-- This is also what lets us stay out of the notification business. Rather than
-- Krafta Pay sending SMS or Telegram dunning messages (we do not have the
-- merchant's subscribers' chat ids — their bot does, and SMS in UZ means a
-- carrier contract and per-message cost), `subscription.payment_failed` carries
-- a ready-to-use hosted `payUrl`. The merchant's own bot sends the message in
-- their own voice, on their own channel.
--
-- DELIVERY SEMANTICS
-- ------------------
-- At-least-once, ordered per endpoint only by best effort. Each delivery row is
-- an (event, endpoint) pair; `(endpoint_id, event_id)` is unique so a retry or
-- a double-fire of the producing code cannot enqueue the same event twice.
-- Consumers must be idempotent on `event_id` — the same guidance Stripe gives.

-- ---------------------------------------------------------------------------
-- endpoints
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payments.webhook_endpoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id uuid NOT NULL,
    environment text NOT NULL DEFAULT 'live',
    url text NOT NULL,
    description text,
    -- NULL = subscribe to every event type, including ones added later. An
    -- explicit array pins the endpoint to exactly those types.
    enabled_events text[],
    status text NOT NULL DEFAULT 'enabled',
    -- Signing secret (whsec_...), AES-256-GCM under PAY_CREDENTIALS_SECRET.
    -- Encrypted rather than hashed because the merchant must be able to reveal
    -- it again in the dashboard to configure their verifier.
    secret_encrypted jsonb NOT NULL,
    -- Auto-disable circuit breaker: a permanently-dead endpoint stops consuming
    -- delivery-worker budget once this crosses the threshold.
    consecutive_failure_count integer NOT NULL DEFAULT 0,
    disabled_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT webhook_endpoints_pkey PRIMARY KEY (id),
    CONSTRAINT webhook_endpoints_environment_check CHECK (environment IN ('test', 'live')),
    CONSTRAINT webhook_endpoints_status_check CHECK (status IN ('enabled', 'disabled')),
    CONSTRAINT webhook_endpoints_url_check CHECK (url ~ '^https?://'),
    CONSTRAINT webhook_endpoints_failure_count_check CHECK (consecutive_failure_count >= 0)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'webhook_endpoints_org_id_fkey'
  ) THEN
    ALTER TABLE payments.webhook_endpoints
      ADD CONSTRAINT webhook_endpoints_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS webhook_endpoints_org_env_idx
  ON payments.webhook_endpoints (org_id, environment)
  WHERE status = 'enabled';

COMMENT ON TABLE payments.webhook_endpoints IS
  'Merchant-registered HTTPS endpoints that receive Krafta Pay subscription lifecycle events.';
COMMENT ON COLUMN payments.webhook_endpoints.enabled_events IS
  'NULL subscribes to all event types (including future ones). An array pins the endpoint to exactly those types.';

-- ---------------------------------------------------------------------------
-- deliveries
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payments.webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    endpoint_id uuid NOT NULL,
    org_id uuid NOT NULL,
    environment text NOT NULL DEFAULT 'live',
    -- Logical event identity. Shared across every endpoint that receives this
    -- same event, and echoed to the merchant as the payload `id` so consumers
    -- can dedupe.
    event_id uuid NOT NULL,
    event_type text NOT NULL,
    subscription_id uuid,
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    attempt_count integer NOT NULL DEFAULT 0,
    next_attempt_at timestamp with time zone DEFAULT now(),
    delivered_at timestamp with time zone,
    last_status_code integer,
    last_error text,
    -- First 500 chars of the merchant's response. Debugging aid for "why is my
    -- endpoint failing" support conversations; never contains our secrets.
    last_response_snippet text,
    CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id),
    CONSTRAINT webhook_deliveries_status_check
      CHECK (status IN ('pending', 'succeeded', 'failed')),
    CONSTRAINT webhook_deliveries_environment_check CHECK (environment IN ('test', 'live')),
    CONSTRAINT webhook_deliveries_attempt_count_check CHECK (attempt_count >= 0)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'webhook_deliveries_endpoint_id_fkey'
  ) THEN
    ALTER TABLE payments.webhook_deliveries
      ADD CONSTRAINT webhook_deliveries_endpoint_id_fkey
      FOREIGN KEY (endpoint_id) REFERENCES payments.webhook_endpoints(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'webhook_deliveries_org_id_fkey'
  ) THEN
    ALTER TABLE payments.webhook_deliveries
      ADD CONSTRAINT webhook_deliveries_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- The idempotency guarantee: one row per (endpoint, logical event), forever.
CREATE UNIQUE INDEX IF NOT EXISTS webhook_deliveries_endpoint_event_unique
  ON payments.webhook_deliveries (endpoint_id, event_id);

-- The delivery worker's claim query. Partial so it stays small as succeeded
-- rows accumulate.
CREATE INDEX IF NOT EXISTS webhook_deliveries_due_idx
  ON payments.webhook_deliveries (next_attempt_at)
  WHERE status = 'pending';

-- Dashboard: recent deliveries for an endpoint, newest first.
CREATE INDEX IF NOT EXISTS webhook_deliveries_endpoint_recent_idx
  ON payments.webhook_deliveries (endpoint_id, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_deliveries_subscription_idx
  ON payments.webhook_deliveries (subscription_id)
  WHERE subscription_id IS NOT NULL;

COMMENT ON TABLE payments.webhook_deliveries IS
  'One row per (endpoint, event). At-least-once delivery with exponential backoff; consumers dedupe on payload.id (= event_id).';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- Both tables are written and read exclusively by service-role code paths (the
-- dashboard routes authorize org membership in app code before touching them,
-- exactly as the existing payments tables do). Enable RLS with no permissive
-- policy so an anon/authenticated key can never read another merchant's
-- endpoints or event payloads.

ALTER TABLE payments.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.webhook_deliveries ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON payments.webhook_endpoints TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON payments.webhook_deliveries TO service_role;
