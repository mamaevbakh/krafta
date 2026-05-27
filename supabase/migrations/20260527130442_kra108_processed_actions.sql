-- KRA-108: idempotency keys for cart server actions
--
-- Why: the storefront cart's localStorage mutation queue + in-memory
-- debounce + race-aware drain were a hand-rolled at-most-once attempt
-- that produced a string of seam bugs (3ee59a8, 100b0ad, 2f30624). The
-- industry-standard fix is server-side idempotency keys (Stripe / Square
-- pattern). Client generates a UUID per logical user action, sends it
-- with every cart mutation; server checks the table before processing
-- and returns the cached result on retries.
--
-- Closes structurally:
--   * Multi-tab same-action races
--   * React 19 strict-mode double-invoke of transitions
--   * Persistent queue replay producing duplicate writes
--   * Browser refresh during in-flight action
--
-- Once this is live the client can drop the localStorage mutation queue
-- + per-key in-memory accumulator + reconcileServerSummary's 3 guards.
-- See KRA-108 for the full refactor plan.

create table commerce.processed_actions (
  -- Client-generated UUID (crypto.randomUUID() at dispatch time). The
  -- whole point is letting the client own the idempotency key — a retry
  -- under the same key returns the same cached result instead of
  -- re-executing the mutation.
  id uuid primary key,
  -- Scoping: an idempotency key is only meaningful within the customer
  -- session that created it. RLS + this FK prevent cross-customer reuse.
  customer_id uuid not null references commerce.customers(id) on delete cascade,
  -- The cached result of the wrapped server action. For cart actions
  -- this is the CartSummary JSON. Retry → return this verbatim.
  result jsonb not null,
  created_at timestamptz not null default now()
);

-- Index for the TTL cleanup pass below
create index processed_actions_created_at_idx
  on commerce.processed_actions (created_at);

-- Index for the per-customer scan (RLS filter)
create index processed_actions_customer_id_idx
  on commerce.processed_actions (customer_id);

-- RLS — each customer reads / writes only their own keys
alter table commerce.processed_actions enable row level security;

-- SELECT: only the customer whose id matches the row's customer_id, and
-- only when that customer's `user_id` matches the current auth.uid().
-- Mirrors the access pattern of commerce.orders + commerce.order_line_items.
create policy processed_actions_select_owner on commerce.processed_actions
  for select to anon, authenticated
  using (
    customer_id in (
      select id from commerce.customers where user_id = (select auth.uid())
    )
  );

-- INSERT: same gate. WITH CHECK ensures the new row's customer_id
-- matches the authenticated user's customer record.
create policy processed_actions_insert_owner on commerce.processed_actions
  for insert to anon, authenticated
  with check (
    customer_id in (
      select id from commerce.customers where user_id = (select auth.uid())
    )
  );

-- No UPDATE policy: once a key is recorded its result is immutable.
-- Re-running an action with the same key returns the cached row;
-- mutating cached results would break the idempotency contract.
--
-- No DELETE policy for customers: rows expire via the cron job below.
-- Service role still bypasses RLS for the cleanup job.

-- Hourly cleanup of expired keys. 24h TTL is plenty for retry-after-
-- network-blip semantics; longer would just bloat the table without
-- adding safety. pg_cron is already installed (KRA-91 worker schedule).
select cron.schedule(
  'expire-processed-actions',
  '0 * * * *',
  $$ delete from commerce.processed_actions where created_at < now() - interval '24 hours'; $$
);

-- Comment for any future reader who's wondering why this exists
comment on table commerce.processed_actions is
  'Server-side idempotency dedup table for cart actions (KRA-108). Client sends crypto.randomUUID() per logical action; server caches the result here and returns it on retry. 24h TTL via pg_cron.';
