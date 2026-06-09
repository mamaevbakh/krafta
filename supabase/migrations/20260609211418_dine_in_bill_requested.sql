-- Dine-in: "ask for the bill" signal on the table check (ADR 0004).
--
-- A guest can ask for the bill from the running-check sheet; this stamps the
-- open table_session so the merchant dashboard can surface "tables awaiting a
-- bill" and the notification path can ping the venue. Set when a guest asks;
-- irrelevant once the merchant settles + closes the session (KRA-67).
-- Merchant-only close in v1 — no auto-close.

ALTER TABLE commerce.table_sessions
  ADD COLUMN IF NOT EXISTS bill_requested_at timestamptz;

-- Dashboard "tables awaiting a bill" lookup: open sessions with a pending
-- request, scoped per venue.
CREATE INDEX IF NOT EXISTS table_sessions_bill_requested_idx
  ON commerce.table_sessions (venue_id)
  WHERE bill_requested_at IS NOT NULL AND status = 'open';
