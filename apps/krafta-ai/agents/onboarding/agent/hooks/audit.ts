import { defineHook } from "eve/hooks"

import { recordToolCall } from "../lib/audit"
import { loadAgentConfig } from "../lib/registry"

/**
 * Records every tool call the agent makes.
 *
 * A hook rather than a line inside each tool, and that is the whole point: the
 * requirement is "every action is recorded", and per-tool logging quietly
 * becomes "every action someone remembered to instrument". A tool added next
 * month is audited without its author doing anything. `handoff_to_human`
 * deliberately does NOT write its own row any more — one writer, one row.
 *
 * Observe-only by contract, so a failure here cannot change what the agent
 * does. That cuts both ways: an audit write that fails is invisible to the
 * customer, which is the right trade (never break a conversation to log it)
 * but means the log is best-effort rather than transactional. If it ever needs
 * to be authoritative for billing or disputes, it has to move into the tool
 * path where it can fail loudly.
 */

/**
 * `actions.requested` carries the arguments and `action.result` carries the
 * outcome, so the two halves are joined by callId. Bounded because a leak here
 * would be a slow memory climb in a long-lived runtime; an entry that falls
 * out just logs without its arguments, which is a degraded row rather than a
 * missing one.
 */
const pending = new Map<string, { toolName: string; input: unknown; at: number }>()
const MAX_PENDING = 200

function remember(callId: string, toolName: string, input: unknown) {
  if (pending.size >= MAX_PENDING) {
    const oldest = pending.keys().next().value
    if (oldest) pending.delete(oldest)
  }
  pending.set(callId, { toolName, input, at: Date.now() })
}

export default defineHook({
  events: {
    async "actions.requested"(event) {
      for (const action of event.data.actions) {
        // The stream also carries skill loads and subagent dispatches, which
        // have no toolName and are not merchant-facing actions.
        if (action.kind !== "tool-call") continue
        remember(action.callId, action.toolName, action.input)
      }
    },

    async "action.result"(event, ctx) {
      const result = event.data.result
      // Skills and subagent returns also ride this event; only authored tool
      // calls belong in the merchant's audit trail.
      if (result.kind !== "tool-result") return

      const caller = ctx.session.auth.current
      const tenantId = caller?.attributes.tenantId
      // No verified tenant means no row: an audit entry that cannot be
      // attributed to a business is noise at best and cross-tenant confusion
      // at worst.
      if (typeof tenantId !== "string") return

      // Verification traffic is not merchant activity. Recording it would put
      // six fake customer conversations into the log every time someone
      // pressed "run again", and the log's whole value is that everything in
      // it really happened.
      if (caller?.attributes.sandboxed === "1") return

      const remembered = pending.get(result.callId)
      pending.delete(result.callId)

      const agentIdAttr = caller?.attributes.agentId
      const config = await loadAgentConfig(
        tenantId,
        typeof agentIdAttr === "string" ? agentIdAttr : null
      )

      await recordToolCall({
        orgId: tenantId,
        agentId: config?.id ?? null,
        actorUserId: typeof caller?.principalId === "string" ? caller.principalId : null,
        toolName: result.toolName,
        args: remembered?.input ?? null,
        output: result.output,
        isError: result.isError === true,
        latencyMs: remembered ? Date.now() - remembered.at : null,
      })
    },
  },
})
