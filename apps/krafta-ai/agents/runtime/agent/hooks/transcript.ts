import { defineHook } from "eve/hooks"

import { loadAgentConfig } from "../lib/registry"
import { readUsage, recordMessage, type TranscriptOrigin } from "../lib/transcript"

/**
 * Writes down every conversation, as it happens.
 *
 * A hook rather than lines scattered through the tools and channel, for the
 * same reason the audit log is a hook: the requirement is "we can see what the
 * agent said", and per-callsite logging quietly becomes "what someone
 * remembered to log". A channel added next month is transcribed without its
 * author doing anything — which matters, because Telegram is next.
 *
 * ORIGIN is the load-bearing field and it is decided here, once. A merchant
 * testing their own draft and a verification run must never look like customer
 * traffic: they would inflate the merchant's numbers and, if `countable` were
 * ever wrong, land on an invoice. The database refuses to mark anything but
 * `customer` as countable, so the worst case of getting this wrong is a
 * misleading list rather than a false charge — but a misleading list is
 * exactly what destroys trust in a dashboard.
 */

/** Joins a tool's arguments to its result, which arrive on separate events. */
const pending = new Map<string, { toolName: string; detail: string; at: number }>()
const MAX_PENDING = 200

function describeInput(input: unknown): string {
  if (typeof input === "string") return input
  if (!input || typeof input !== "object") return ""
  const record = input as Record<string, unknown>
  for (const key of ["query", "q", "search", "reason", "text", "question"]) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 500)
  }
  const first = Object.values(record).find((v) => typeof v === "string" && v.trim())
  return typeof first === "string" ? first.slice(0, 500) : ""
}

// Matches eve's HookContext shape rather than an idealised one: `current` is
// `SessionAuthContext | null`, and writing `undefined` here made every handler
// fail to typecheck.
function contextOf(ctx: {
  session: {
    id?: string
    auth: {
      current?:
        | { attributes: Record<string, unknown>; principalId?: string }
        | null
    }
  }
}) {
  const caller = ctx.session.auth.current
  const orgId = caller?.attributes.tenantId
  const sessionId = ctx.session.id
  if (typeof orgId !== "string" || typeof sessionId !== "string" || !sessionId) {
    return null
  }
  const agentIdAttr = caller?.attributes.agentId
  const origin: TranscriptOrigin =
    caller?.attributes.sandboxed === "1" ? "verification" : "preview"
  return {
    orgId,
    sessionId,
    agentIdHint: typeof agentIdAttr === "string" ? agentIdAttr : null,
    origin,
  }
}

export default defineHook({
  events: {
    async "message.received"(event, ctx) {
      const base = contextOf(ctx)
      if (!base) return
      const text = String((event.data as { message?: unknown })?.message ?? "").trim()
      if (!text) return

      const config = await loadAgentConfig(base.orgId, base.agentIdHint)
      await recordMessage({
        orgId: base.orgId,
        sessionId: base.sessionId,
        agentId: config?.id ?? null,
        role: "user",
        content: text,
        origin: base.origin,
      })
    },

    async "actions.requested"(event) {
      for (const action of event.data.actions) {
        if (action.kind !== "tool-call") continue
        if (pending.size >= MAX_PENDING) {
          const oldest = pending.keys().next().value
          if (oldest) pending.delete(oldest)
        }
        pending.set(action.callId, {
          toolName: action.toolName,
          detail: describeInput(action.input),
          at: Date.now(),
        })
      }
    },

    async "action.result"(event, ctx) {
      const base = contextOf(ctx)
      if (!base) return
      const result = event.data.result
      if (result.kind !== "tool-result") return

      const remembered = pending.get(result.callId)
      pending.delete(result.callId)

      const config = await loadAgentConfig(base.orgId, base.agentIdHint)

      // A handoff is not "a tool ran" — it is the conversation leaving the
      // agent's hands, and it is the single most important line in a
      // merchant's inbox because it is the one where a person is now waiting.
      // Recorded as its own role so the conversation flips to `escalated`.
      if (result.toolName === "handoff_to_human") {
        const output = result.output as { contact?: string; handedOff?: boolean }
        if (output?.handedOff) {
          await recordMessage({
            orgId: base.orgId,
            sessionId: base.sessionId,
            agentId: config?.id ?? null,
            role: "escalation",
            content: remembered?.detail || null,
            escalatedTo: typeof output.contact === "string" ? output.contact : null,
            origin: base.origin,
          })
          return
        }
      }

      await recordMessage({
        orgId: base.orgId,
        sessionId: base.sessionId,
        agentId: config?.id ?? null,
        role: "tool",
        content: null,
        toolName: result.toolName,
        toolDetail: remembered?.detail || null,
        latencyMs: remembered ? Date.now() - remembered.at : null,
        origin: base.origin,
      })
    },

    async "message.completed"(event, ctx) {
      const base = contextOf(ctx)
      if (!base) return
      const text = String((event.data as { message?: unknown })?.message ?? "").trim()
      if (!text) return

      const config = await loadAgentConfig(base.orgId, base.agentIdHint)
      await recordMessage({
        orgId: base.orgId,
        sessionId: base.sessionId,
        agentId: config?.id ?? null,
        role: "assistant",
        content: text,
        model: config?.model ?? null,
        origin: base.origin,
      })
    },

    /*
      Usage rides on `step.completed`, not on the message — so the tokens are
      attached to the conversation here rather than to any one line of it.
      Recorded as a zero-content `system` row purely to carry the counts onto
      the conversation totals, because record_message is the only writer and
      keeping it that way is worth one odd-looking row per step.
    */
    async "step.completed"(event, ctx) {
      const base = contextOf(ctx)
      if (!base) return
      const usage = readUsage(event.data)
      if (usage.inputTokens === 0 && usage.outputTokens === 0) return

      // Carries the agent even though this row is only a counter. A
      // conversation cannot be OPENED without one (agent_id is NOT NULL), and
      // a step can legitimately settle before the first message is recorded —
      // without this, the opening write would be declined and the tokens for
      // that turn would vanish.
      const config = await loadAgentConfig(base.orgId, base.agentIdHint)
      await recordMessage({
        orgId: base.orgId,
        sessionId: base.sessionId,
        agentId: config?.id ?? null,
        role: "system",
        content: null,
        model: config?.model ?? null,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        origin: base.origin,
      })
    },
  },
})
