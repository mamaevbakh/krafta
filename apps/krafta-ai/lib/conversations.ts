import { createClient } from "@supabase/supabase-js"

import { getSelectedOrg } from "@/lib/orgs"

/**
 * The merchant's inbox — what their agent actually said to people.
 *
 * Uses the service-key client with `db.schema = "agent"`, matching lib/agents.ts.
 * The generated database types only cover `public`, so `.schema("agent")` on the
 * typed browser client does not compile; every reader of this schema in the app
 * goes through an admin client instead.
 *
 * WHICH MEANS ROW-LEVEL SECURITY IS NOT PROTECTING THESE READS. service_role
 * bypasses it. Every query below MUST filter by org_id explicitly, and the org
 * comes from the session via getSelectedOrg — never from a caller's argument.
 * Forget the filter on one query and a merchant reads another business's
 * conversations with their customers.
 */

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("missing_supabase_admin_credentials")
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "agent" },
  })
}

export type ConversationRow = {
  id: string
  agentId: string
  agentName: string | null
  origin: "customer" | "preview" | "verification"
  channel: "web" | "telegram" | "widget"
  status: "open" | "resolved" | "escalated" | "abandoned" | "blocked"
  escalatedTo: string | null
  messageCount: number
  startedAt: string
  lastMessageAt: string
  /** First thing the person said. The only preview worth showing in a list. */
  opener: string | null
}

export type ThreadMessage = {
  seq: number
  role: "user" | "assistant" | "tool" | "escalation"
  content: string | null
  toolName: string | null
  toolDetail: string | null
  escalatedTo: string | null
  createdAt: string
  latencyMs: number | null
}

export type Thread = {
  conversation: ConversationRow
  messages: ThreadMessage[]
}

/**
 * `system` rows exist only to carry token counts onto the conversation — they
 * have no content and mean nothing to a person. Filtered on the way out rather
 * than never written, because the counts are genuinely useful and this is the
 * only place they would ever be mistaken for speech.
 */
const VISIBLE_ROLES = ["user", "assistant", "tool", "escalation"] as const

export async function listConversations(params: {
  agentId?: string
  limit?: number
}): Promise<ConversationRow[]> {
  const org = await getSelectedOrg()
  if (!org) return []

  let query = db()
    .from("conversations")
    .select(
      "id, agent_id, origin, channel, status, escalated_to, message_count, " +
        "started_at, last_message_at, agents(name)"
    )
    .eq("org_id", org.id)
    .order("last_message_at", { ascending: false })
    .limit(params.limit ?? 50)

  if (params.agentId) query = query.eq("agent_id", params.agentId)

  const { data, error } = await query
  if (error || !data) return []

  const rows = data as unknown as Record<string, unknown>[]

  // The opener is on the messages table, so it is a second query rather than a
  // join — one round trip for the whole page instead of one per row.
  const ids = rows.map((r) => String(r.id))
  const openers = await firstMessages(ids)

  return rows.map((r) => {
    const agent = r.agents as { name?: string } | null
    return {
      id: String(r.id),
      agentId: String(r.agent_id),
      agentName: agent?.name ?? null,
      origin: r.origin as ConversationRow["origin"],
      channel: r.channel as ConversationRow["channel"],
      status: r.status as ConversationRow["status"],
      escalatedTo: (r.escalated_to as string | null) ?? null,
      messageCount: Number(r.message_count ?? 0),
      startedAt: String(r.started_at),
      lastMessageAt: String(r.last_message_at),
      opener: openers.get(String(r.id)) ?? null,
    }
  })
}

/** The first thing each person said, for the inbox list. */
async function firstMessages(
  conversationIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (conversationIds.length === 0) return out

  const org = await getSelectedOrg()
  if (!org) return out

  const { data } = await db()
    .from("messages")
    .select("conversation_id, content, seq")
    .eq("org_id", org.id)
    .in("conversation_id", conversationIds)
    .eq("role", "user")
    .order("seq", { ascending: true })

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const id = String(row.conversation_id)
    // Ordered by seq ascending, so the first one wins and later ones are
    // ignored — the opener, not the most recent thing they said.
    if (!out.has(id) && typeof row.content === "string" && row.content.trim()) {
      out.set(id, row.content.trim())
    }
  }
  return out
}

export async function getThread(conversationId: string): Promise<Thread | null> {
  const org = await getSelectedOrg()
  if (!org) return null

  const { data: conversation } = await db()
    .from("conversations")
    .select(
      "id, agent_id, origin, channel, status, escalated_to, message_count, " +
        "started_at, last_message_at, agents(name)"
    )
    .eq("org_id", org.id)
    .eq("id", conversationId)
    // Scoped by org_id above, so an id belonging to another business reads
    // exactly like one that does not exist — the 404-never-403 rule, enforced
    // by returning null either way.
    .maybeSingle()

  if (!conversation) return null

  const c = conversation as unknown as Record<string, unknown>
  const agent = c.agents as { name?: string } | null

  const { data: messages } = await db()
    .from("messages")
    .select(
      "seq, role, content, tool_name, tool_detail, escalated_to, created_at, latency_ms"
    )
    .eq("org_id", org.id)
    .eq("conversation_id", conversationId)
    .in("role", VISIBLE_ROLES as unknown as string[])
    .order("seq", { ascending: true })

  return {
    conversation: {
      id: String(c.id),
      agentId: String(c.agent_id),
      agentName: agent?.name ?? null,
      origin: c.origin as ConversationRow["origin"],
      channel: c.channel as ConversationRow["channel"],
      status: c.status as ConversationRow["status"],
      escalatedTo: (c.escalated_to as string | null) ?? null,
      messageCount: Number(c.message_count ?? 0),
      startedAt: String(c.started_at),
      lastMessageAt: String(c.last_message_at),
      opener: null,
    },
    messages: ((messages ?? []) as Record<string, unknown>[]).map((m) => ({
      seq: Number(m.seq),
      role: m.role as ThreadMessage["role"],
      content: (m.content as string | null) ?? null,
      toolName: (m.tool_name as string | null) ?? null,
      toolDetail: (m.tool_detail as string | null) ?? null,
      escalatedTo: (m.escalated_to as string | null) ?? null,
      createdAt: String(m.created_at),
      latencyMs: (m.latency_ms as number | null) ?? null,
    })),
  }
}
