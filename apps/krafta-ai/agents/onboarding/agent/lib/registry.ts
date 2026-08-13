import { createClient } from "@supabase/supabase-js"

/**
 * Loads a tenant's agent configuration for session start.
 *
 * This read sits on the critical path of every customer conversation, so it is
 * one indexed row by primary key — never a join, never a spec parse. If it
 * grows a second query, session start slows for every merchant at once.
 */

export type AgentConfig = {
  id: string
  orgId: string
  name: string
  status: string
  persona: string | null
  model: string | null
  reasoningEffort: string | null
  languages: string[]
  defaultLanguage: string
  businessName: string | null
  hoursText: string | null
  tone: string | null
  escalationContact: string | null
  unconnectedFallback: string | null
}

type Row = Record<string, unknown>

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("missing_supabase_admin_credentials")
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "agent" },
  })
}

function toConfig(row: Row): AgentConfig {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    name: String(row.name ?? ""),
    status: String(row.status ?? "draft"),
    persona: (row.persona as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    reasoningEffort: (row.reasoning_effort as string | null) ?? null,
    languages: Array.isArray(row.languages) ? (row.languages as string[]) : [],
    defaultLanguage: String(row.default_language ?? "uz"),
    businessName: (row.business_name as string | null) ?? null,
    hoursText: (row.hours_text as string | null) ?? null,
    tone: (row.tone as string | null) ?? null,
    escalationContact: (row.escalation_contact as string | null) ?? null,
    unconnectedFallback: (row.unconnected_fallback as string | null) ?? null,
  }
}

const SELECT =
  "id, org_id, name, status, persona, model, reasoning_effort, languages, " +
  "default_language, business_name, hours_text, tone, escalation_contact, " +
  "unconnected_fallback"

/**
 * Resolve the agent this session is acting as.
 *
 * `agentId` is a client-supplied hint and is therefore filtered by `org_id`
 * rather than trusted: asking for another business's agent returns nothing and
 * falls through to this tenant's own. The assertion afterwards is deliberate
 * redundancy — this client uses the service role and so bypasses RLS, meaning
 * a mistake in the filter would be a silent cross-tenant read rather than an
 * empty result. RLS is not covering us here; the `eq` is.
 */
export async function loadAgentConfig(
  tenantId: string,
  agentId?: string | null
): Promise<AgentConfig | null> {
  const db = admin()

  if (agentId) {
    const { data } = await db
      .from("agents")
      .select(SELECT)
      .eq("org_id", tenantId)
      .eq("id", agentId)
      .maybeSingle()
    if (data) return assertTenant(toConfig(data as unknown as Row), tenantId)
  }

  // No hint, or a hint that did not belong to this tenant: fall back to the
  // business's live agent, then its most recent draft, so a merchant who has
  // published exactly one agent never has to name it.
  const { data } = await db
    .from("agents")
    .select(SELECT)
    .eq("org_id", tenantId)
    .order("status", { ascending: true }) // 'draft' < 'live' < 'paused'
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return data ? assertTenant(toConfig(data as unknown as Row), tenantId) : null
}

function assertTenant(config: AgentConfig, tenantId: string): AgentConfig {
  if (config.orgId !== tenantId) {
    throw new Error("tenant_mismatch_in_agent_config")
  }
  return config
}
