import type { EveMessage } from "eve/react"

import { type AgentProposal } from "@/lib/preview/proposal"

/**
 * Projects the onboarding conversation into the timeline the builder renders.
 *
 * The builder is a working session, not a chat: the agent looks the business
 * up, thinks, asks, and eventually proposes. Rendering all of that as speech
 * bubbles would be a lie — it makes the agent look like it *said* it searched
 * when what happened is that it *did*. So this keeps four distinct shapes:
 *
 *   thinking  — the model reasoning out loud, collapsed by default
 *   work      — tool calls, GROUPED into one collapsible run
 *   speech    — what the agent actually said to the owner
 *   proposal  — the finished thing, which is a card and not a message
 *
 * Grouping consecutive tool calls is the difference between a readable
 * transcript and a wall of one-line receipts. Three searches in a row is one
 * line that says "Looked up the business", openable if you care.
 */

/** A page the agent actually read, shown to the owner as a real link. */
export type Source = {
  url: string
  title: string
}

export type WorkStep = {
  /** Raw tool name. The UI maps known ones to human words. */
  tool: string
  /** One short line describing what it was asked to do. */
  detail: string
  running: boolean
  /** Where the answer came from, when the tool reported it. */
  sources: Source[]
}

export type BuilderEntry =
  | { kind: "user"; id: string; text: string }
  | { kind: "thinking"; id: string; text: string; streaming: boolean }
  | { kind: "work"; id: string; steps: WorkStep[] }
  | { kind: "speech"; id: string; text: string; streaming: boolean }
  | { kind: "proposal"; id: string; proposal: AgentProposal }

/**
 * Tools that must never render as work.
 *
 * `ask_question` IS the question card — showing "used ask_question" above it
 * would narrate the mechanism instead of asking the question. `propose_agent`
 * becomes the proposal card for the same reason.
 */
const HIDDEN_TOOLS = new Set(["ask_question", "propose_agent"])

/**
 * Strips the provider's inline search-citation markers out of visible text.
 *
 * OpenAI's web search annotates its answers with citation spans delimited by
 * private-use codepoints. Nothing renders them, so they reach the screen as
 * replacement boxes around raw tokens — observed verbatim on the first live
 * run of the interview:
 *
 *   "...support/merchant tools. □cite□turn0search1□turn0search0□ Quick
 *    question to start: who should this agent serve?"
 *
 * A business owner reads that as the product being broken, and they are not
 * wrong. Same lesson as the template-slug leak next door in proposal.ts:
 * prose in an instructions file cannot enforce a mechanical rule, so it is
 * enforced here instead.
 *
 * Both forms are handled — the paired span, and any orphan delimiters or
 * `turnNsearchN` tokens left behind when the pair is split across deltas
 * while the text is still streaming.
 */
export function stripCitations(text: string): string {
  return text
    .replace(/[\uE200-\uE2FF][\s\S]*?[\uE200-\uE2FF]/g, "")
    .replace(/[\uE200-\uE2FF]/g, "")
    .replace(/\bcite\b(?=turn\d)/g, "")
    .replace(/\bturn\d+(?:search|news|view|image)\d+\b/g, "")
    // Tidy the double spaces and orphaned punctuation the removal leaves.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .trim()
}

export function toBuilderTimeline(
  messages: readonly EveMessage[]
): BuilderEntry[] {
  const entries: BuilderEntry[] = []
  let key = 0

  /**
   * Appends to the trailing work group rather than starting a new one, so a
   * run of tool calls collapses into a single openable line. Any other entry
   * kind between them naturally breaks the group, because this only ever
   * looks at the LAST entry.
   */
  function pushStep(step: WorkStep) {
    const last = entries.at(-1)
    if (last?.kind === "work") {
      last.steps.push(step)
      return
    }
    entries.push({ kind: "work", id: `work-${key++}`, steps: [step] })
  }

  for (const message of messages) {
    if (message.role === "user") {
      const text = message.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("")
        .trim()
      if (text) entries.push({ kind: "user", id: `user-${key++}`, text })
      continue
    }

    for (const part of message.parts) {
      if (part.type === "reasoning") {
        const text = stripCitations(part.text)
        if (!text) continue
        // Reasoning arrives as a growing block. Extend the trailing one rather
        // than emitting a new entry per delta, or the transcript flickers into
        // dozens of near-identical panels while the model thinks.
        const last = entries.at(-1)
        if (last?.kind === "thinking") {
          last.text = text
          last.streaming = part.state === "streaming"
          continue
        }
        entries.push({
          kind: "thinking",
          id: `think-${key++}`,
          text,
          streaming: part.state === "streaming",
        })
        continue
      }

      if (part.type === "text") {
        const text = stripCitations(part.text)
        if (!text) continue
        const last = entries.at(-1)
        if (last?.kind === "speech") {
          last.text = text
          last.streaming = part.state === "streaming"
          continue
        }
        entries.push({
          kind: "speech",
          id: `say-${key++}`,
          text,
          streaming: part.state === "streaming",
        })
        continue
      }

      if (part.type !== "dynamic-tool") continue

      if (part.toolName === "propose_agent") {
        // Only a settled call is a proposal. Arguments still streaming means
        // the model has not decided, and rendering a half-formed proposal
        // shows the owner a plan it is about to change its mind about.
        if (part.state !== "output-available") continue
        const output = part.output as Partial<AgentProposal> & {
          proposed?: boolean
        }
        if (!output?.proposed || typeof output.templateSlug !== "string") continue
        entries.push({
          kind: "proposal",
          id: `proposal-${key++}`,
          proposal: output as AgentProposal,
        })
        continue
      }

      if (HIDDEN_TOOLS.has(part.toolName)) continue

      // Show work as soon as the arguments are known rather than waiting for a
      // result — someone watching a slow lookup needs to see it is happening.
      if (part.state === "input-streaming") continue

      pushStep({
        tool: part.toolName,
        detail: describeInput(part.input),
        running: part.state !== "output-available",
        sources: collectSources(part.output),
      })
    }
  }

  return entries
}

/**
 * Pulls the pages a search or fetch actually read out of its result.
 *
 * Written against the SHAPE rather than a named provider field, deliberately.
 * `web_search` has no local executor — the model provider runs it — so its
 * result shape is the provider's, not eve's, and it is free to change under us
 * on their schedule. Anything that looks like a list of `{url, title}` counts;
 * anything that does not yields no sources and the step simply renders
 * without links, which is the honest failure.
 *
 * This is what makes the citation markers useful instead of noise: the model
 * writes "payme.uz is a payments platform" with an unrenderable marker glued
 * to it, and the owner gets a link they can click to check.
 */
function collectSources(output: unknown, depth = 0): Source[] {
  if (depth > 3 || !output || typeof output !== "object") return []

  const found: Source[] = []
  const seen = new Set<string>()

  function consider(value: unknown) {
    if (!value || typeof value !== "object") return
    const record = value as Record<string, unknown>
    const url = record.url ?? record.link ?? record.href
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      if (seen.has(url)) return
      seen.add(url)
      const title = record.title ?? record.name ?? record.heading
      found.push({
        url,
        // Falling back to the host keeps the link readable when the provider
        // gives no title — "payme.uz" beats a bare URL in a transcript.
        title:
          typeof title === "string" && title.trim()
            ? title.trim()
            : safeHost(url),
      })
    }
  }

  const queue: unknown[] = [output]
  let steps = 0
  while (queue.length > 0 && steps < 200) {
    steps++
    const current = queue.shift()
    if (Array.isArray(current)) {
      for (const item of current) {
        consider(item)
        if (item && typeof item === "object") queue.push(item)
      }
      continue
    }
    if (current && typeof current === "object") {
      consider(current)
      for (const value of Object.values(current as Record<string, unknown>)) {
        if (value && typeof value === "object") queue.push(value)
      }
    }
  }

  // A search that returns fifty hits is not fifty things the owner wants to
  // read. The point is "here is where this came from", not a results page.
  return found.slice(0, 6)
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/**
 * One short line describing what a tool was asked to do.
 *
 * Deliberately not JSON: the owner is glancing at a transcript, not reading a
 * payload. A single string argument is the common case (a search query) and
 * reads best raw.
 */
function describeInput(input: unknown): string {
  if (typeof input === "string") return input
  if (!input || typeof input !== "object") return ""

  const record = input as Record<string, unknown>
  for (const key of ["query", "q", "search", "url", "reason", "text"]) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }

  const first = Object.values(record).find(
    (v) => typeof v === "string" && v.trim()
  )
  return typeof first === "string" ? first : ""
}
