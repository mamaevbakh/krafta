import { createClient } from "@supabase/supabase-js"

/**
 * Writes the merchant-visible audit trail.
 *
 * This is what an enterprise buyer asks for in month two, and what a merchant
 * reads when a customer says "your bot promised me a refund". It has to be
 * complete and it has to be safe to show: complete, because a missing entry is
 * indistinguishable from an action that never happened; safe, because the
 * arguments a tool receives can contain a customer's phone number or, worse, a
 * credential the agent was handed.
 *
 * `agent.audit_log` is append-only by database trigger, so nothing here — and
 * nothing later — can rewrite history.
 */

/** Argument keys whose VALUES are never written, whatever they contain. */
const SECRET_KEYS =
  /(token|secret|password|passwd|api[-_]?key|authorization|auth|credential|cookie|session)/i

const MAX_STRING = 300
const MAX_DEPTH = 4

/**
 * Redacts before storage, not before display.
 *
 * A secret that reaches the table has already leaked — it is in backups, in
 * logs, and readable by every member of the organisation through the console.
 * Filtering at render time would be too late, so the value never lands.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (depth >= MAX_DEPTH) return "[deep]"

  if (typeof value === "string") {
    return value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING)}… (${value.length} chars)`
      : value
  }
  if (typeof value === "number" || typeof value === "boolean") return value

  if (Array.isArray(value)) {
    // Long arrays are usually embeddings or search hits — the shape matters,
    // the thousandth element does not.
    const head = value.slice(0, 10).map((v) => redact(v, depth + 1))
    return value.length > 10 ? [...head, `… ${value.length - 10} more`] : head
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEYS.test(key) ? "[redacted]" : redact(inner, depth + 1)
    }
    return out
  }

  return "[unserialisable]"
}

/** One human-readable line for the audit table's `result` column. */
export function summarise(toolName: string, output: unknown, isError: boolean): string {
  if (isError) return "Failed"

  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>

    if (toolName === "handoff_to_human") {
      return typeof record.contact === "string"
        ? `Escalated to ${record.contact}`
        : "Escalation requested, no contact configured"
    }

    if (Array.isArray(record.results)) {
      const n = record.results.length
      return n === 0 ? "No matches" : `${n} match${n === 1 ? "" : "es"}`
    }
    if (record.found === false) return "No matches"
  }

  return "Completed"
}

export type AuditEntryInput = {
  orgId: string
  agentId: string | null
  actorUserId: string | null
  toolName: string
  args: unknown
  output: unknown
  isError: boolean
  latencyMs: number | null
}

export async function recordToolCall(entry: AuditEntryInput): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return

  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "agent" },
  })

  await db.from("audit_log").insert({
    org_id: entry.orgId,
    agent_id: entry.agentId,
    actor: "customer",
    actor_kind: "customer",
    actor_user_id: entry.actorUserId,
    tool: entry.toolName,
    outcome: entry.isError ? "error" : "ok",
    result: summarise(entry.toolName, entry.output, entry.isError),
    arguments: redact(entry.args) as Record<string, unknown>,
    latency_ms: entry.latencyMs,
  })
}
