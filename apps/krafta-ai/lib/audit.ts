import { createClient } from "@supabase/supabase-js"

/**
 * Read model for the console's audit screen.
 *
 * Filters run in the database, not in the browser. A merchant investigating a
 * complaint is looking for one entry among thousands, and shipping the whole
 * log to the client to filter it there would be slow, expensive, and would put
 * rows on screen that the filter was meant to exclude.
 */

export type AuditRow = {
  id: string
  at: string
  agentId: string | null
  agentName: string | null
  actor: string
  actorKind: string
  tool: string
  result: string
  outcome: string
  latencyMs: number | null
  args: Record<string, unknown> | null
}

export type AuditFilters = {
  agentId?: string
  tool?: string
  /** customer | user | system — who the action was taken on behalf of. */
  actorKind?: string
  /** ISO date (YYYY-MM-DD) in Tashkent terms, inclusive. */
  from?: string
  to?: string
}

/** One page is plenty for a screen; the CSV export is the bulk path. */
const PAGE = 200

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

/**
 * Uzbekistan is UTC+5 with no daylight saving, so a calendar day the merchant
 * means is a fixed offset — no timezone library required, and the boundary is
 * the same every month of the year.
 */
const TASHKENT_OFFSET = "+05:00"

export async function listAudit(
  orgId: string,
  filters: AuditFilters = {},
  limit = PAGE
): Promise<AuditRow[]> {
  let query = db()
    .from("audit_log")
    .select(
      "id, created_at, agent_id, actor, actor_kind, tool, result, outcome, latency_ms, arguments"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (filters.agentId) query = query.eq("agent_id", filters.agentId)
  if (filters.tool) query = query.eq("tool", filters.tool)
  if (filters.actorKind) query = query.eq("actor_kind", filters.actorKind)
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00${TASHKENT_OFFSET}`)
  // `to` is inclusive of the whole day the merchant picked — an exclusive
  // bound silently drops everything that happened today.
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999${TASHKENT_OFFSET}`)

  const { data } = await query
  const rows = (data ?? []) as unknown as Row[]

  const agentIds = [...new Set(rows.map((r) => r.agent_id).filter(Boolean))] as string[]
  const names = new Map<string, string>()
  if (agentIds.length > 0) {
    const { data: agents } = await db()
      .from("agents")
      .select("id, name")
      .eq("org_id", orgId)
      .in("id", agentIds)
    for (const a of (agents ?? []) as unknown as Row[]) {
      names.set(String(a.id), String(a.name))
    }
  }

  return rows.map((r) => ({
    id: String(r.id),
    at: String(r.created_at),
    agentId: (r.agent_id as string | null) ?? null,
    agentName: r.agent_id ? (names.get(String(r.agent_id)) ?? null) : null,
    actor: String(r.actor ?? ""),
    actorKind: String(r.actor_kind ?? "system"),
    tool: String(r.tool ?? ""),
    result: String(r.result ?? ""),
    outcome: String(r.outcome ?? "ok"),
    latencyMs: r.latency_ms === null ? null : Number(r.latency_ms),
    args: (r.arguments as Record<string, unknown> | null) ?? null,
  }))
}

/** Distinct tools this business has actually used, for the filter control. */
export async function listAuditTools(orgId: string): Promise<string[]> {
  const { data } = await db()
    .from("audit_log")
    .select("tool")
    .eq("org_id", orgId)
    .limit(1000)
  const tools = new Set((data ?? []).map((r) => String((r as Row).tool)))
  return [...tools].filter(Boolean).sort()
}
