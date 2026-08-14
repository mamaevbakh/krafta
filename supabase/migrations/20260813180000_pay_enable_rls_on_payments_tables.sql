-- Turn on the row-level security that was already written but never enforced.
--
-- Seven tables in the payments schema had RLS DISABLED. Three of them —
-- invoices, plans, subscriptions — already carried an `*_org_isolation` policy
-- scoping rows to the caller's organisation membership. Those policies have
-- never run: a policy on a table without RLS enabled is inert. Someone built
-- the protection and Postgres has been ignoring it.
--
-- WHY THIS IS NOT THEORETICAL. `anon` cannot reach the schema at all (verified:
-- the REST API answers "permission denied for schema payments"), but that same
-- request proves the schema IS served over PostgREST — anon fails on the grant,
-- not on the schema being hidden. And `authenticated` holds both USAGE on the
-- schema and SELECT on these tables. With no RLS to filter rows, any logged-in
-- user could read every merchant's customers, subscriptions, invoices and saved
-- payment methods. One merchant's student list, readable by any other merchant
-- with an account.
--
-- WHY IT IS SAFE TO ENABLE. Every read in the application goes through the
-- service-role client, which bypasses RLS by design — including the customer
-- portal routes, which look like user-scoped code and are not. So this closes
-- the direct-API door without changing a single working code path.
--
-- The four tables with no policy get deny-by-default, which is correct: nothing
-- but the service role has any business reading them. The three with policies
-- get the isolation their authors intended. Enabling is idempotent, so this is
-- a no-op anywhere it has already been done.

alter table payments.customers          enable row level security;
alter table payments.checkout_sessions  enable row level security;
alter table payments.invoices           enable row level security;
alter table payments.payment_intents    enable row level security;
alter table payments.payment_methods    enable row level security;
alter table payments.plans              enable row level security;
alter table payments.subscriptions      enable row level security;
