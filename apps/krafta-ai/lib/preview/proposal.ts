import type { EveMessage } from "eve/react"

/**
 * What `propose_agent` returns, once it has actually run.
 *
 * Everything past `rationale` is optional on purpose. The onboarding agent is
 * told that a guessed value is worse than an empty one — an empty field gets
 * filled in on the next screen, a wrong one gets published and a customer
 * reads it. So absence here is a real signal, not a gap to paper over.
 */
export type AgentProposal = {
  templateSlug: string
  rationale: string

  /**
   * Who talks to this agent. The single most load-bearing field: for a
   * payments company it is the difference between helping a merchant
   * reconcile a settlement and telling a shopper why their card was declined.
   * No template can hold this, which is why the old six-field proposal could
   * not describe anything but a shop.
   */
  audience?: "customers" | "businesses" | "staff" | "mixed"

  handles?: string[]
  mustNotDo?: string[]

  needsLookups?: string[]
  hasIntegration?: boolean
  needsIntegrationHelp?: boolean
  integrationNotes?: string

  businessName?: string
  businessSummary?: string
  hours?: string
  languages?: string[]
  escalation?: string
  tone?: string
  channel?: string
}

/** Narrows an unknown to a string[], dropping anything that is not a string. */
function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.filter((v): v is string => typeof v === "string" && v.trim() !== "")
  return items.length > 0 ? items : undefined
}

const AUDIENCES = ["customers", "businesses", "staff", "mixed"] as const

function audienceOf(value: unknown): AgentProposal["audience"] {
  return typeof value === "string" &&
    (AUDIENCES as readonly string[]).includes(value)
    ? (value as AgentProposal["audience"])
    : undefined
}

/**
 * Reads the latest completed proposal out of the onboarding conversation.
 *
 * Only `output-available` counts. A tool call that is still streaming its
 * arguments has not decided anything yet, and rendering a half-formed proposal
 * would show the owner a template the model is about to change its mind about.
 */
export function latestProposal(
  messages: readonly EveMessage[]
): AgentProposal | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== "assistant") continue

    for (let j = message.parts.length - 1; j >= 0; j--) {
      const part = message.parts[j]
      if (part.type !== "dynamic-tool") continue
      if (part.toolName !== "propose_agent") continue
      if (part.state !== "output-available") continue

      const output = part.output as Partial<AgentProposal> & { proposed?: boolean }
      if (!output?.proposed || typeof output.templateSlug !== "string") continue

      const str = (v: unknown) =>
        typeof v === "string" && v.trim() !== "" ? v : undefined
      const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined)

      return {
        templateSlug: output.templateSlug,
        rationale: typeof output.rationale === "string" ? output.rationale : "",

        audience: audienceOf(output.audience),

        handles: stringList(output.handles),
        mustNotDo: stringList(output.mustNotDo),

        needsLookups: stringList(output.needsLookups),
        hasIntegration: bool(output.hasIntegration),
        needsIntegrationHelp: bool(output.needsIntegrationHelp),
        integrationNotes: str(output.integrationNotes),

        businessName: str(output.businessName),
        businessSummary: str(output.businessSummary),
        hours: str(output.hours),
        languages: stringList(output.languages),
        escalation: str(output.escalation),
        tone: str(output.tone),
        channel: str(output.channel),
      }
    }
  }
  return null
}

/**
 * Template slugs are our filing system, not the merchant's vocabulary.
 *
 * The onboarding instructions forbid printing them and the model mostly
 * complies — but "mostly" is how "Template chosen: ombor-1c" reached a
 * merchant-facing reply in testing. Prose cannot enforce a mechanical rule, so
 * this strips them on the way out. Same reasoning as the reply-language
 * resolver: decide it in code, not in a prompt.
 */
const SLUG_PATTERN =
  /\s*\(?\b(venue-support|order-desk|ombor-1c|hr-faq|payment-desk|reporting)\b\)?/gi

function stripSlugs(text: string): string {
  return text
    .replace(SLUG_PATTERN, "")
    // Tidy the punctuation the removal leaves behind — "Template chosen: ."
    .replace(/[ \t]*([:—-])\s*$/gm, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

/** Assistant text, for the conversational half of the door. */
export function latestAssistantText(messages: readonly EveMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== "assistant") continue
    const text = message.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("")
      .trim()
    if (text) return stripSlugs(text)
  }
  return ""
}

/**
 * Hands the proposal to the setup wizard by writing the draft it already knows
 * how to restore.
 *
 * The wizard reads `krafta-ai:setup:<slug>` on mount and replays it into the
 * form (C2). Reusing that instead of inventing a second prefill path means the
 * two doors converge on exactly the same screen state, and a merchant who
 * abandons the wizard after arriving from a proposal still gets their answers
 * back on return.
 *
 * Field names must match the wizard's step names — they are the form keys.
 */
export function writeSetupDraft(proposal: AgentProposal): void {
  const draft: Record<string, string[]> = {}
  if (proposal.businessName) draft.business = [proposal.businessName]
  if (proposal.escalation) draft.escalation = [proposal.escalation]
  if (proposal.languages?.length) draft.languages = proposal.languages
  if (proposal.channel) draft.channel = [proposal.channel]
  // `hours` is deliberately NOT written: the wizard's hours step is a choice
  // between fixed presets, and free text like "every day until late" does not
  // match any of their values. Prefilling it with something the control cannot
  // represent would silently select nothing and look broken.

  try {
    window.localStorage.setItem(
      `krafta-ai:setup:${proposal.templateSlug}`,
      JSON.stringify(draft)
    )
    // The wizard's form keys can only carry the handful of fields it renders,
    // and the interview now learns far more than that — who the agent serves,
    // what it must never touch, what it needs to look up, whether Krafta has
    // to build them an integration. Dropping those on the floor here would
    // make the interview theatre: the owner answers good questions and the
    // agent that gets created has no idea. So the whole proposal rides along
    // under its own key for the create step to fold into the agent's settings.
    window.localStorage.setItem(
      `krafta-ai:proposal:${proposal.templateSlug}`,
      JSON.stringify(proposal)
    )
  } catch {
    // Storage unavailable: the wizard simply opens empty, which is the
    // pre-proposal behaviour and not worth blocking navigation over.
  }
}

/** Where `writeSetupDraft` parks the full proposal for the create step. */
function proposalKey(templateSlug: string): string {
  return `krafta-ai:proposal:${templateSlug}`
}

/**
 * Reads back what the interview learned, for the step that creates the agent.
 *
 * The wizard's form can only carry the handful of fields it renders, so
 * without this the interview is theatre: the owner answers "this is for our
 * merchants, and it must never approve a refund itself" and the agent that
 * gets built has never heard either sentence.
 *
 * Returns null rather than throwing on anything malformed. This is
 * localStorage — the owner may have two tabs open, an old build may have
 * written a different shape, and none of that is worth failing a create over.
 * The server re-validates everything regardless.
 */
export function readProposalDraft(templateSlug: string): AgentProposal | null {
  try {
    const raw = window.localStorage.getItem(proposalKey(templateSlug))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return null
    const candidate = parsed as AgentProposal
    return typeof candidate.templateSlug === "string" ? candidate : null
  } catch {
    return null
  }
}

export function clearProposalDraft(templateSlug: string): void {
  try {
    window.localStorage.removeItem(proposalKey(templateSlug))
  } catch {
    // Losing a stale draft is survivable; throwing during a successful
    // create is not.
  }
}

/** A question the onboarding agent parked the turn on, awaiting an answer. */
export type PendingQuestion = {
  requestId: string
  prompt: string
  options: { id: string; label: string; description?: string }[]
  allowFreeform: boolean
}

/**
 * The question the agent is currently waiting on, if any.
 *
 * Without this the most ambiguous descriptions — a school that mentions both
 * schedule and payment, say — park the session on a question nobody ever sees,
 * and the box just sits there looking broken. Those are precisely the owners
 * who needed the conversational door rather than the template grid.
 */
export function pendingQuestion(
  messages: readonly EveMessage[]
): PendingQuestion | null {
  const last = messages.at(-1)
  if (!last) return null

  for (const part of last.parts) {
    if (part.type !== "dynamic-tool") continue
    const request = part.toolMetadata?.eve?.inputRequest
    if (!request) continue
    // An answered request keeps its metadata; only a still-pending call is a
    // question to put in front of the owner.
    if (part.state !== "approval-requested" && part.state !== "input-available") {
      continue
    }
    return {
      requestId: request.requestId,
      prompt: request.prompt,
      options: (request.options ?? []).map((o) => ({
        id: o.id,
        label: o.label,
        description: o.description,
      })),
      allowFreeform: request.allowFreeform === true,
    }
  }
  return null
}
