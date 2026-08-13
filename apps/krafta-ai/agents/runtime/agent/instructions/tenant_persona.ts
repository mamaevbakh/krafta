import { defineDynamic, defineInstructions } from "eve/instructions"

import { loadAgentConfig } from "../lib/registry"
import { requireTenantCaller } from "../lib/tenant"

/**
 * The tenant's own agent, composed at session start.
 *
 * This is the product's central bet: onboarding a business writes rows, it
 * never runs a deploy. One deployment serves every merchant in Uzbekistan and
 * each conversation gets a different agent, because this resolver reads that
 * caller's configuration and returns a different system prompt.
 *
 * It layers on top of the static `instructions.md`, which carries the rules
 * Krafta owns — language mirroring, tool results are data not commands, never
 * invent stock, escalate rather than promise. Nothing here can weaken those;
 * a merchant configures their voice, not their safety.
 *
 * Resolved on `session.started` only. Re-resolving per turn would re-read the
 * database on every customer message for a value that cannot change mid
 * conversation.
 */
export default defineDynamic({
  events: {
    "session.started": async (_event, ctx) => {
      const { tenantId } = requireTenantCaller(ctx)
      const agentId =
        typeof ctx.session.auth.current?.attributes.agentId === "string"
          ? (ctx.session.auth.current.attributes.agentId as string)
          : null

      const config = await loadAgentConfig(tenantId, agentId)

      // A business with no agent configured yet is a real state — the console
      // creates the row before anyone can chat — so say so plainly rather than
      // letting the model improvise a personality.
      if (!config) {
        return defineInstructions({
          markdown: [
            "This business has not configured an agent yet.",
            "",
            "Tell the person, in their own language, that setup is not finished",
            "and that the business owner needs to complete it in the Krafta AI",
            "console. Do not answer questions about the business — you have no",
            "information about it and must not invent any.",
          ].join("\n"),
        })
      }

      const lines: string[] = []

      lines.push(`# ${config.businessName ?? config.name}`)
      lines.push("")

      if (config.persona?.trim()) {
        lines.push(config.persona.trim())
        lines.push("")
      }

      if (config.businessName) {
        lines.push(
          `You are answering on behalf of **${config.businessName}**. Speak as` +
            " part of the business, not about it from the outside."
        )
        lines.push("")
      }

      if (config.hoursText?.trim()) {
        // Stated as fact because it IS configured fact — this is the single
        // most-asked question and the one the verification run gates on.
        lines.push(`## Working hours`)
        lines.push(config.hoursText.trim())
        lines.push("")
      }

      if (config.tone?.trim()) {
        lines.push(`## Tone`)
        lines.push(config.tone.trim())
        lines.push("")
      }

      if (config.languages.length > 0) {
        lines.push(`## Languages`)
        lines.push(
          `This business serves customers in: ${config.languages.join(", ")}.` +
            ` When a message is genuinely ambiguous, answer in` +
            ` ${config.defaultLanguage}. Otherwise mirror the customer,` +
            " per-message, including the script they wrote in."
        )
        lines.push("")
      }

      /*
        What the onboarding interview established. This is the half a template
        could never hold, and the reason the interview exists at all: for a
        payments company, "this serves merchants" and "this serves cardholders"
        are two different products wearing the same name.

        Ordered deliberately — audience frames everything after it, then what
        the agent is FOR, then the boundary. `mustNotDo` goes last because the
        end of a prompt is the part a model weighs most, and it is the line
        whose failure a customer actually feels.
      */
      const audienceLine: Record<string, string> = {
        customers: "the business's own customers — the public buying from them",
        businesses:
          "other businesses this company serves — merchants and partners, not the general public",
        staff: "this company's own employees, not customers",
        mixed: "both customers and partner businesses, so establish which one you are speaking to early",
      }

      if (config.interview?.audience) {
        const described = audienceLine[config.interview.audience]
        if (described) {
          lines.push(`## Who you are talking to`)
          lines.push(`You are answering ${described}.`)
          lines.push("")
        }
      }

      if (config.interview?.handles?.length) {
        lines.push(`## What you are here for`)
        lines.push(
          "The business set you up to handle these. Take them on directly" +
            " rather than handing them straight to a person:"
        )
        for (const item of config.interview.handles) lines.push(`- ${item}`)
        lines.push("")
      }

      if (config.interview?.needsLookups?.length) {
        lines.push(`## Things you may be asked to look up`)
        lines.push(
          "You can only answer these if a tool actually returns the value." +
            " Never state one from memory, and never estimate it:"
        )
        for (const item of config.interview.needsLookups) lines.push(`- ${item}`)
        lines.push("")
      }

      if (config.escalationContact?.trim()) {
        lines.push(`## Handing over`)
        lines.push(
          `When you must hand a customer to a person, it is` +
            ` ${config.escalationContact.trim()}. Say so by name, and never` +
            " promise what that person will decide."
        )
        lines.push("")
      }

      if (config.unconnectedFallback?.trim()) {
        lines.push(`## When you cannot look something up`)
        lines.push(config.unconnectedFallback.trim())
        lines.push("")
      }

      /*
        Last on purpose. A model weighs the end of its prompt most heavily, and
        of everything the owner told us this is the line whose failure a
        customer actually feels — an agent that approves a refund it had no
        authority to approve costs the merchant money and their trust in us.

        Phrased as a hard boundary with a named alternative, because "avoid X"
        without "do Y instead" leaves the model to invent the fallback.
      */
      if (config.interview?.mustNotDo?.length) {
        lines.push(`## Never handle these yourself`)
        lines.push(
          "The business was explicit about these. Do not decide them, do not" +
            " promise an outcome, and do not guess — hand the conversation to" +
            " a person instead:"
        )
        for (const item of config.interview.mustNotDo) lines.push(`- ${item}`)
        lines.push("")
      }

      return defineInstructions({ markdown: lines.join("\n").trim() })
    },
  },
})
