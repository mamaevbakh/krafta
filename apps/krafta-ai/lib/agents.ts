import { createClient } from "@supabase/supabase-js"

/**
 * Read model for the console's agent screens.
 *
 * Deliberately shaped like the mock module the screens were built against, so
 * swapping the source does not ripple through every component. Where the
 * database cannot answer yet — conversation counts live in `agent.conversations`
 * and nothing writes there until metering (E3) — the field is zero rather than
 * invented. A fabricated "418 conversations" on a real merchant's dashboard is
 * worse than an honest nought.
 */

export type AgentStatus = "draft" | "live" | "paused" | "archived"

export type ConsoleAgent = {
  id: string
  name: string
  templateSlug: string | null
  status: AgentStatus
  channel: string
  languages: string[]
  defaultLanguage: string
  persona: string | null
  model: string | null
  businessName: string | null
  hoursText: string | null
  tone: string | null
  escalationContact: string | null
  lastVerifiedAt: string | null
  /** Gate-only counts from the most recent run; 0/0 when never verified. */
  verificationPassed: number
  verificationTotal: number
  liveVersionId: string | null
  draftVersionId: string | null
  createdAt: string
  /** Not yet metered — see E3. */
  conversations7d: number
  resolvedRate: number
}

const SELECT =
  "id, name, template_slug, status, channel, languages, default_language, " +
  "persona, model, business_name, hours_text, tone, escalation_contact, " +
  "last_verified_at, live_version_id, draft_version_id, created_at, org_id"

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("missing_supabase_admin_credentials")
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "agent" },
  })
}

type Row = Record<string, unknown>

function toAgent(row: Row, gates: { passed: number; total: number }): ConsoleAgent {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    templateSlug: (row.template_slug as string | null) ?? null,
    status: (String(row.status ?? "draft") as AgentStatus),
    channel: String(row.channel ?? "web"),
    languages: Array.isArray(row.languages) ? (row.languages as string[]) : [],
    defaultLanguage: String(row.default_language ?? "uz"),
    persona: (row.persona as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    businessName: (row.business_name as string | null) ?? null,
    hoursText: (row.hours_text as string | null) ?? null,
    tone: (row.tone as string | null) ?? null,
    escalationContact: (row.escalation_contact as string | null) ?? null,
    lastVerifiedAt: (row.last_verified_at as string | null) ?? null,
    verificationPassed: gates.passed,
    verificationTotal: gates.total,
    liveVersionId: (row.live_version_id as string | null) ?? null,
    draftVersionId: (row.draft_version_id as string | null) ?? null,
    createdAt: String(row.created_at),
    conversations7d: 0,
    resolvedRate: 0,
  }
}

/**
 * Latest gate score per agent, in one query rather than N.
 *
 * The console lists every agent a business owns; a per-agent verification
 * lookup would turn one screen into one query per row. Ordering by
 * `started_at` and keeping the first sighting of each agent gives the newest
 * run without a window function through PostgREST.
 */
async function latestGates(
  orgId: string,
  agentIds: string[]
): Promise<Map<string, { passed: number; total: number }>> {
  const out = new Map<string, { passed: number; total: number }>()
  if (agentIds.length === 0) return out

  const { data } = await db()
    .from("verification_runs")
    .select("agent_id, gates_passed, gates_total, started_at")
    .eq("org_id", orgId)
    .in("agent_id", agentIds)
    .order("started_at", { ascending: false })

  for (const raw of (data ?? []) as unknown as Row[]) {
    const id = String(raw.agent_id)
    if (out.has(id)) continue
    out.set(id, {
      passed: Number(raw.gates_passed ?? 0),
      total: Number(raw.gates_total ?? 0),
    })
  }
  return out
}

export async function listAgents(orgId: string): Promise<ConsoleAgent[]> {
  const { data } = await db()
    .from("agents")
    .select(SELECT)
    .eq("org_id", orgId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })

  const rows = (data ?? []) as unknown as Row[]
  const gates = await latestGates(
    orgId,
    rows.map((r) => String(r.id))
  )

  return rows.map((r) =>
    toAgent(r, gates.get(String(r.id)) ?? { passed: 0, total: 0 })
  )
}

/**
 * One agent, scoped by organisation.
 *
 * `org_id` is in the WHERE clause, not checked after the fetch: this client
 * uses the service role and bypasses RLS, so an id from the URL must never be
 * the only filter. A merchant pasting another business's agent id gets null,
 * which the page turns into a 404 — never a 403, which would confirm the agent
 * exists.
 */
export async function getAgent(
  orgId: string,
  agentId: string
): Promise<ConsoleAgent | null> {
  const { data } = await db()
    .from("agents")
    .select(SELECT)
    .eq("org_id", orgId)
    .eq("id", agentId)
    .maybeSingle()

  if (!data) return null
  const gates = await latestGates(orgId, [agentId])
  return toAgent(
    data as unknown as Row,
    gates.get(agentId) ?? { passed: 0, total: 0 }
  )
}
