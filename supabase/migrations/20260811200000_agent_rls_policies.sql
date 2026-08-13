-- Krafta AI — row-level security for the `agent` schema.
--
-- 20260811190000_agent_schema.sql enabled RLS on all twelve tables and wrote no
-- policies, which denies everything to `authenticated`. That is the correct
-- fail-closed starting point and it is also why the console cannot read a row
-- until this migration lands. Nothing about Krafta AI works before this.
--
-- Two things are required and neither is sufficient alone:
--   1. GRANTs — `authenticated` had USAGE on the schema but no table
--      privileges at all, so every query failed on permissions before RLS was
--      ever consulted.
--   2. Policies — with grants but no policy, RLS still denies.
--
-- Tenancy rule: `public.is_org_role(org_id, roles)` — the same SECURITY
-- DEFINER helper `public.venues`, `commerce` and the rest of this database
-- already use. It is SECURITY DEFINER on purpose: `public.organization_members`
-- carries its own RLS, and a plain sub-select here would be evaluated under
-- those policies and could recurse or silently return nothing.
--
-- Every table in `agent` carries `org_id` denormalised precisely so that one
-- predicate secures all of them. Do not "optimise" that away by joining to a
-- parent — a join makes the policy depend on the parent's policy.
--
-- Write model:
--   * The CONSOLE (a signed-in merchant, `authenticated`) writes the things a
--     merchant authors: agents, versions, documents, integrations, approval
--     decisions.
--   * The RUNTIME (the eve agents, `service_role`, which bypasses RLS) writes
--     everything generated: conversations, messages, chunks, verification
--     results, audit entries. `authenticated` gets SELECT on those and nothing
--     more, so a compromised browser session cannot forge a conversation into
--     existence and cannot fabricate an audit trail.
--   * DELETE is owner/admin only, and only where deleting is meaningful.
--     History (`agent_versions`, `verification_runs`, `approvals`) is never
--     client-deletable: a merchant disputing a bill or an action needs it.
--
-- `anon` is deliberately granted nothing — it has no USAGE on this schema. The
-- public web widget will need its own narrowly-scoped path later; it must not
-- be bolted on by widening these policies.

set local lock_timeout = '3s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------- grants ---

grant select on all tables in schema agent to authenticated;

grant insert, update on
  agent.agents,
  agent.agent_versions,
  agent.documents,
  agent.integrations,
  agent.approvals
  to authenticated;

grant delete on
  agent.agents,
  agent.documents,
  agent.integrations
  to authenticated;

-- --------------------------------------------------------------- helpers ---

-- Read access = any member. Mutating access = any member. Destroying =
-- owner/admin. Spelled out per table below rather than hidden in a loop, so a
-- reader can see exactly what each table permits without running anything.

-- ---------------------------------------------------------------- agents ---

drop policy if exists agents_select on agent.agents;
create policy agents_select on agent.agents for select to authenticated
  using (public.is_org_role(org_id));

drop policy if exists agents_insert on agent.agents;
create policy agents_insert on agent.agents for insert to authenticated
  with check (public.is_org_role(org_id));

drop policy if exists agents_update on agent.agents;
create policy agents_update on agent.agents for update to authenticated
  using (public.is_org_role(org_id))
  -- WITH CHECK repeats the predicate so an UPDATE cannot move a row into
  -- another organisation. The freeze_org_id trigger also blocks this; belt and
  -- braces, because the trigger is the kind of thing a later migration drops.
  with check (public.is_org_role(org_id));

drop policy if exists agents_delete on agent.agents;
create policy agents_delete on agent.agents for delete to authenticated
  using (public.is_org_role(org_id, array['owner','admin']));

-- -------------------------------------------------------- agent_versions ---

drop policy if exists agent_versions_select on agent.agent_versions;
create policy agent_versions_select on agent.agent_versions for select to authenticated
  using (public.is_org_role(org_id));

drop policy if exists agent_versions_insert on agent.agent_versions;
create policy agent_versions_insert on agent.agent_versions for insert to authenticated
  with check (public.is_org_role(org_id));

-- Published versions are frozen by trigger; this allows the draft edits that
-- precede publishing. No delete policy: version history is the rollback path.
drop policy if exists agent_versions_update on agent.agent_versions;
create policy agent_versions_update on agent.agent_versions for update to authenticated
  using (public.is_org_role(org_id))
  with check (public.is_org_role(org_id));

-- ------------------------------------------------------------- documents ---

drop policy if exists documents_select on agent.documents;
create policy documents_select on agent.documents for select to authenticated
  using (public.is_org_role(org_id));

drop policy if exists documents_insert on agent.documents;
create policy documents_insert on agent.documents for insert to authenticated
  with check (public.is_org_role(org_id));

drop policy if exists documents_update on agent.documents;
create policy documents_update on agent.documents for update to authenticated
  using (public.is_org_role(org_id))
  with check (public.is_org_role(org_id));

drop policy if exists documents_delete on agent.documents;
create policy documents_delete on agent.documents for delete to authenticated
  using (public.is_org_role(org_id, array['owner','admin']));

-- ---------------------------------------------------------- integrations ---

-- `secret_ref` is a pointer, never a secret, so members may read the row. If a
-- credential value is ever added to this table, revoke member SELECT first.
drop policy if exists integrations_select on agent.integrations;
create policy integrations_select on agent.integrations for select to authenticated
  using (public.is_org_role(org_id));

drop policy if exists integrations_insert on agent.integrations;
create policy integrations_insert on agent.integrations for insert to authenticated
  with check (public.is_org_role(org_id, array['owner','admin']));

drop policy if exists integrations_update on agent.integrations;
create policy integrations_update on agent.integrations for update to authenticated
  using (public.is_org_role(org_id, array['owner','admin']))
  with check (public.is_org_role(org_id, array['owner','admin']));

drop policy if exists integrations_delete on agent.integrations;
create policy integrations_delete on agent.integrations for delete to authenticated
  using (public.is_org_role(org_id, array['owner','admin']));

-- ------------------------------------------------------------- approvals ---

-- A member may see and decide a pending approval. They may not create one (the
-- agent does) and may not delete one (the decision is the audit trail).
drop policy if exists approvals_select on agent.approvals;
create policy approvals_select on agent.approvals for select to authenticated
  using (public.is_org_role(org_id));

drop policy if exists approvals_update on agent.approvals;
create policy approvals_update on agent.approvals for update to authenticated
  using (public.is_org_role(org_id))
  with check (public.is_org_role(org_id));

-- ------------------------------------------ runtime-written, read-only -----

-- Generated by the agents under service_role. `authenticated` reads its own
-- organisation's rows and can write none of them.

drop policy if exists conversations_select on agent.conversations;
create policy conversations_select on agent.conversations for select to authenticated
  using (public.is_org_role(org_id));

drop policy if exists messages_select on agent.messages;
create policy messages_select on agent.messages for select to authenticated
  using (public.is_org_role(org_id));

drop policy if exists message_citations_select on agent.message_citations;
create policy message_citations_select on agent.message_citations for select to authenticated
  using (public.is_org_role(org_id));

drop policy if exists doc_chunks_select on agent.doc_chunks;
create policy doc_chunks_select on agent.doc_chunks for select to authenticated
  using (public.is_org_role(org_id));

drop policy if exists verification_runs_select on agent.verification_runs;
create policy verification_runs_select on agent.verification_runs for select to authenticated
  using (public.is_org_role(org_id));

drop policy if exists verification_results_select on agent.verification_results;
create policy verification_results_select on agent.verification_results for select to authenticated
  using (public.is_org_role(org_id));

-- The audit log is readable by members and writable by nobody through this
-- role. It is also append-only by trigger, so even service_role cannot rewrite
-- history — which is the entire point of having it.
drop policy if exists audit_log_select on agent.audit_log;
create policy audit_log_select on agent.audit_log for select to authenticated
  using (public.is_org_role(org_id));
