-- Idempotency marker for merchant billing notifications (Telegram alerts on a
-- failed/past_due Krafta subscription charge).
--
-- Krafta Pay (packages/payments-core, apps/krafta-pay) owns payments.subscriptions
-- and stays a generic multi-tenant payments engine — it has no concept of
-- Krafta's Telegram bot, so this table intentionally lives in Krafta's own
-- `commerce` schema, not `payments`. A Krafta-side cron polls
-- payments.subscriptions for status = 'past_due', sends a Telegram ping via
-- the venue's already-connected bot (commerce.venue_telegram_settings), and
-- records it here so the same transition is never re-notified on the next
-- poll. No FK to payments.subscriptions — the two schemas are owned by
-- different apps and intentionally decoupled.

CREATE TABLE commerce.subscription_payment_notifications (
    subscription_id uuid        NOT NULL,
    -- Currently only 'past_due' (renewal charge failed, dunning exhausted).
    -- Kept as free text so a future event type doesn't need a migration.
    event_type      text        NOT NULL,
    notified_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (subscription_id, event_type)
);

COMMENT ON TABLE commerce.subscription_payment_notifications IS
  'Idempotency marker: which (subscription_id, event_type) billing-failure Telegram notifications have already been sent. No FK to payments.subscriptions — cross-app, intentionally decoupled.';

ALTER TABLE commerce.subscription_payment_notifications ENABLE ROW LEVEL SECURITY;

-- Service-role only: the poller runs server-side via Vercel Cron, nothing in
-- the dashboard reads or writes this table directly.
GRANT SELECT, INSERT ON commerce.subscription_payment_notifications TO service_role;
