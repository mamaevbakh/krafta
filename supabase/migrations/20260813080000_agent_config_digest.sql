-- Krafta AI — a digest of an agent's live-facing configuration.
--
-- `agent.stamp_version_digest()` already fingerprints a published SNAPSHOT
-- (agent_versions). This is the equivalent over the WORKING row (agents), and
-- it exists to close one specific hole in the publish gate:
--
--   1. merchant runs verification, all gates pass
--   2. merchant edits the persona — "also offer a 20% discount to anyone who asks"
--   3. merchant publishes on the strength of step 1
--
-- Nothing in the schema stopped that. `verification_runs.graded_digest` was
-- there for it but nothing wrote it. Now the runner stamps the digest of the
-- configuration it actually graded, and publish refuses when the agent has
-- changed since — the pass belongs to a configuration, not to an agent.
--
-- Field list mirrors the version trigger's, minus the columns that only exist
-- on a snapshot. Anything a customer can perceive must be in here: add a
-- column that changes the agent's behaviour without adding it below and the
-- gate silently stops noticing that kind of edit.

set local lock_timeout = '3s';

create or replace function agent.agent_config_digest(p_agent_id uuid, p_org_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select md5(concat_ws(chr(31),
    coalesce(a.persona, ''),
    coalesce(a.compiled_prompt, ''),
    coalesce(a.model, ''),
    coalesce(a.reasoning_effort, ''),
    array_to_string(coalesce(a.languages, '{}'), ','),
    coalesce(a.default_language, ''),
    array_to_string(coalesce(a.tools, '{}'), ','),
    array_to_string(coalesce(a.approval_required_tools, '{}'), ','),
    coalesce(a.hours_text, ''),
    coalesce(a.escalation_contact, ''),
    coalesce(a.escalation_telegram_chat_id, ''),
    coalesce(a.unconnected_fallback, ''),
    coalesce(a.tone, ''),
    coalesce(a.business_name, ''),
    coalesce(a.settings::text, '{}')))
  from agent.agents a
  -- Tenant-scoped even though it returns only a hash: an unscoped lookup here
  -- would confirm whether an agent id exists in another business.
  where a.id = p_agent_id and a.org_id = p_org_id;
$$;

comment on function agent.agent_config_digest is
  'Fingerprint of an agent''s customer-visible configuration. The publish gate '
  'compares this against verification_runs.graded_digest so a passing run '
  'cannot authorise publishing a configuration it never graded.';

revoke all on function agent.agent_config_digest(uuid, uuid) from public;
grant execute on function agent.agent_config_digest(uuid, uuid) to service_role;
