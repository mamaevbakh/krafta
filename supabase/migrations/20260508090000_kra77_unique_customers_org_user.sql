-- KRA-77 — partial UNIQUE on commerce.customers (org_id, user_id).
--
-- ensureCartIdentity (apps/krafta/lib/cart/identity.ts) does a
-- select-then-insert keyed on (org_id, user_id). Concurrent first calls
-- (a double-tap on the cart drawer, an abandoned form re-mount,
-- multi-tab visitors) can race past the SELECT and produce two
-- commerce.customers rows for the same auth user. That's a real correctness
-- bug: subsequent cart calls would non-deterministically attach to either
-- row, and any per-customer aggregation would split.
--
-- Fix: enforce uniqueness at the DB level. Partial index because user_id is
-- nullable for guest checkouts (no auth user yet) and we don't want to
-- collapse all guests into one row. The customers_has_identifier_chk
-- constraint already guarantees guests have *some* identifier.
--
-- The select-then-insert in identity.ts now catches 23505 and re-reads,
-- so the constraint is invisible to callers under the race.
--
-- The existing customers_user_id_idx (single column, partial) stays —
-- this two-column index can't substitute for queries that filter on user_id
-- alone (leading column is org_id).

CREATE UNIQUE INDEX customers_org_id_user_id_uniq
  ON commerce.customers (org_id, user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON INDEX commerce.customers_org_id_user_id_uniq IS
  'KRA-77: one commerce.customers row per (org, auth user). See identity.ts.';
