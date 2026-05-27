-- KRA-108 hotfix: scope processed_actions by user_id, not customer_id.
--
-- The original policy joined through commerce.customers to derive
-- ownership from auth.uid(). That subquery runs in the caller's role
-- context — and `commerce.customers.customers_select_authed` is the
-- only SELECT policy on customers (no `to anon` clause). Anon-but-
-- authenticated cart sessions (signInAnonymously sets role=authenticated
-- + is_anonymous=true) should technically pass, but the original IN
-- subquery was returning empty in practice and silently failing every
-- processed_actions INSERT (n_tup_ins=0 even after dispatching ~10
-- actions on the v2 branch).
--
-- The fix: store the auth user_id directly on processed_actions, scope
-- RLS by `user_id = auth.uid()`. No cross-table join, no implicit
-- dependence on the customers SELECT policy chain. Customer ID was
-- never used for anything except RLS gating — dropping it removes a
-- redundant column.

alter table commerce.processed_actions
  add column user_id uuid;

-- No existing rows to migrate (table is empty per pg_stat n_tup_ins=0).
-- If we were past that, the migration would backfill via:
--   update commerce.processed_actions p
--     set user_id = c.user_id
--     from commerce.customers c
--     where c.id = p.customer_id;

alter table commerce.processed_actions
  alter column user_id set not null;

create index processed_actions_user_id_idx
  on commerce.processed_actions (user_id);

drop policy if exists processed_actions_select_owner on commerce.processed_actions;
drop policy if exists processed_actions_insert_owner on commerce.processed_actions;

create policy processed_actions_select_owner on commerce.processed_actions
  for select to anon, authenticated
  using (user_id = (select auth.uid()));

create policy processed_actions_insert_owner on commerce.processed_actions
  for insert to anon, authenticated
  with check (user_id = (select auth.uid()));

-- customer_id was only ever a scoping mechanism for RLS. Drop it — the
-- (id) PK + user_id RLS provides the same isolation without the join.
alter table commerce.processed_actions
  drop column customer_id;
