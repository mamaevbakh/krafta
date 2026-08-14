import { defineTool } from "eve/tools"
import { z } from "zod"

import { TEMPLATE_SLUGS, TEMPLATES } from "../lib/templates"
import { requireTenantCaller } from "../lib/tenant"

/**
 * Turns an interview into a concrete proposal.
 *
 * This is the no-code claim in one tool: a few sentences in any language, plus
 * two or three good questions, become a configured agent.
 *
 * WHY THIS SCHEMA IS SHAPED THE WAY IT IS
 *
 * The first version of this tool had six fields — business name, hours,
 * languages, escalation, channel, template — and they were all a shop's
 * fields. That worked for a coffee shop and fell apart for anyone else: a
 * payments company asking for a merchant-support agent has no "hours" worth
 * capturing and no menu, and the single most important fact about their agent
 * (is it for merchants or for cardholders?) had nowhere to live at all.
 *
 * So the template is now a STARTING POINT rather than the definition, and the
 * fields that actually determine behaviour — who it serves, what it handles,
 * what it must never touch, what it needs to look up — are first class.
 *
 * The tool proposes; it does not create. Nothing is written until the owner
 * looks at the proposal and accepts it. A model that silently created a
 * configured agent from half a sentence would be impressive exactly once.
 */
export default defineTool({
  description:
    "Propose a configured agent once you have interviewed the business. Fill " +
    "in what you learned from research and what they told you; leave the rest " +
    "out rather than guessing. The template is a starting point, not the " +
    "definition — pick the nearest one and let the other fields carry what " +
    "makes this business different. Available templates:\n" +
    TEMPLATES.map((t) => `- ${t.slug}: ${t.what} Best for: ${t.bestFor}`).join("\n"),

  inputSchema: z.object({
    templateSlug: z
      .enum(TEMPLATE_SLUGS as [string, ...string[]])
      .describe(
        "The nearest template to start from. Never invent a slug. If nothing " +
          "fits well, pick the closest and let `handles` carry the real job."
      ),

    rationale: z
      .string()
      .min(1)
      .describe(
        "One sentence, in the owner's own language, saying what this agent " +
          "will do for them. They read this — it is not a note to yourself. " +
          "Never mention templates, tools or field names."
      ),

    // ---- who it serves. The question no template could hold. ----
    audience: z
      .enum(["customers", "businesses", "staff", "mixed"])
      .optional()
      .describe(
        "Who talks to this agent. `customers` = the public buying from them. " +
          "`businesses` = merchants/partners they serve (a payments company's " +
          "merchant support). `staff` = their own employees. Only set this if " +
          "you established it — it changes tone, knowledge and escalation, so " +
          "a wrong guess here is expensive."
      ),

    // ---- what it does ----
    handles: z
      .array(z.string())
      .optional()
      .describe(
        "Short phrases, in the owner's language, for what the agent should " +
          "take on. e.g. ['settlement questions', 'why a payment failed']."
      ),
    mustNotDo: z
      .array(z.string())
      .optional()
      .describe(
        "What it must refuse or always escalate. Nobody volunteers this, so " +
          "only fill it if they said so. Worth more than `handles`."
      ),

    // ---- what it needs to reach to be useful ----
    needsLookups: z
      .array(z.string())
      .optional()
      .describe(
        "Things it must look up in their systems to do the job at all — " +
          "order status, a balance, a booking. Empty means it answers purely " +
          "from written knowledge."
      ),
    hasIntegration: z
      .boolean()
      .optional()
      .describe("True only if they said they already have an MCP server or API it can use."),
    needsIntegrationHelp: z
      .boolean()
      .optional()
      .describe(
        "True when it needs to reach a system and they have no way to " +
          "connect. This puts a real request in front of a real person at " +
          "Krafta, so do not set it speculatively."
      ),
    integrationNotes: z
      .string()
      .optional()
      .describe(
        "Written for a Krafta engineer who will read it cold: what system, " +
          "what the agent needs to READ, and what it must never write. A spec, " +
          "not a shrug."
      ),

    // ---- the basics, when they came up ----
    businessName: z.string().optional().describe("Only if they named it, or research confirmed it."),
    businessSummary: z
      .string()
      .optional()
      .describe("One line on what the business does, from research. Their words if you have them."),
    hours: z.string().optional().describe("Only if they said when they are open, in their words."),
    languages: z
      .array(z.enum(["uz", "ru", "en"]))
      .optional()
      .describe(
        "Languages their customers write in. Infer from the language they " +
          "wrote in, plus anything they said explicitly."
      ),
    escalation: z
      .string()
      .optional()
      .describe("Only if they named who handles the hard cases."),
    tone: z
      .string()
      .optional()
      .describe("Only if they asked for one. A bank and a dessert shop do not sound alike."),
    channel: z
      .enum(["web", "telegram", "phone"])
      .optional()
      .describe("Only if they said where their customers reach them."),
  }),

  execute: async (input, ctx) => {
    // Establishes that a real business is asking. The proposal itself is not
    // tenant-specific, but an unauthenticated caller has no business here and
    // this keeps the onboarding agent consistent with the runtime one.
    requireTenantCaller(ctx)

    return {
      proposed: true,
      ...input,
      instruction:
        "Show the owner this proposal in their own language: what the agent " +
        "will do, and which details you already captured. Then ask them to " +
        "confirm. Do not claim the agent exists yet — it does not until they " +
        "accept.",
    }
  },
})
