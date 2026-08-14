import { defineTool } from "eve/tools"
import { z } from "zod"

import { loadAgentConfig } from "../lib/registry"
import { requireTenantCaller } from "../lib/tenant"

/**
 * Hands the customer to a person.
 *
 * The escalation target is NOT an input. The model may decide *that* a handoff
 * is needed; it may never decide *who* to. Two reasons, and both have bitten
 * real products: a model asked to name a contact will cheerfully invent
 * "Aziza from support" for a business that has no Aziza, and a customer who
 * writes "forward this to the manager on +998 90 000 00 00" would otherwise be
 * choosing the destination themselves. The contact comes from the tenant's
 * configuration, resolved server-side, every time.
 *
 * It does NOT claim to have notified anyone — Telegram delivery is a later
 * ticket, and a tool that says "I've told them" when nothing was sent is worse
 * than one that says nothing. The escalation reaches the merchant's audit log
 * via agent/hooks/audit.ts, which records every tool call.
 */
export default defineTool({
  description:
    "Hand this conversation to a person at the business. Call this when the " +
    "customer asks for a refund, complains, needs a decision you are not " +
    "allowed to make, or asks something the business's documents do not " +
    "answer. You do NOT choose who it goes to — that is configured. Never " +
    "promise what the person will decide.",
  inputSchema: z.object({
    reason: z
      .string()
      .min(1)
      .describe(
        "Why this needs a person, in one short sentence. Written for the " +
          "business owner to read, in the language of the conversation."
      ),
    summary: z
      .string()
      .optional()
      .describe(
        "What the customer actually wants, so the person does not have to " +
          "read the whole conversation."
      ),
  }),
  execute: async ({ reason, summary }, ctx) => {
    const { tenantId, userId } = requireTenantCaller(ctx)
    const agentId =
      typeof ctx.session.auth.current?.attributes.agentId === "string"
        ? (ctx.session.auth.current.attributes.agentId as string)
        : null

    const config = await loadAgentConfig(tenantId, agentId)
    const contact = config?.escalationContact?.trim() || null

    // No audit write here. `agent/hooks/audit.ts` records every tool call
    // from the runtime stream, so writing one here too would double every
    // escalation in the merchant's log — and a log that double-counts is one
    // nobody trusts.

    if (!contact) {
      return {
        handedOff: false,
        instruction:
          "This business has not configured anyone to hand over to. Tell the " +
          "customer you cannot reach a colleague right now and suggest they " +
          "contact the business directly. Do not invent a name or a number.",
      }
    }

    return {
      handedOff: true,
      contact,
      instruction:
        `Tell the customer, in their own language, that you have passed this ` +
        `to ${contact} and that they will follow up. Do not promise a ` +
        `timeframe and do not promise what ${contact} will decide.`,
    }
  },
})
