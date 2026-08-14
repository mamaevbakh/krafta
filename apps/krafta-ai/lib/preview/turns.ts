import type { EveMessage } from "eve/react"

import type { PreviewTurn } from "@/lib/mock/data"

/**
 * Projects eve's message stream into the turn shape the preview already
 * renders.
 *
 * The screen's composition is the valuable part and it stays untouched: a tool
 * call is a `Marker`, an escalation is a `Marker` with a separator, and only
 * actual speech becomes a `Bubble`. Flattening tool activity into chat bubbles
 * is the single most common way an agent UI misleads its owner — it makes the
 * agent look like it *said* it searched, when what happened is that it *did*.
 *
 * Order matters and is preserved: within one assistant message eve emits parts
 * in the order they occurred, so a search that preceded an answer renders
 * above it.
 */
export function toPreviewTurns(
  messages: readonly EveMessage[]
): PreviewTurn[] {
  const turns: PreviewTurn[] = []

  for (const message of messages) {
    if (message.role === "user") {
      const text = message.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("")
        .trim()
      if (text) turns.push({ kind: "user", text })
      continue
    }

    for (const part of message.parts) {
      if (part.type === "text") {
        const text = part.text.trim()
        if (text) turns.push({ kind: "agent", text })
        continue
      }

      if (part.type !== "dynamic-tool") continue

      // A handoff is not "a tool ran" — it is the conversation leaving the
      // agent's hands, so it renders as a break rather than another step.
      // Only on a completed call: an in-flight handoff has not happened yet,
      // and saying it has is exactly the lie B3 was about.
      if (part.toolName === "handoff_to_human") {
        if (part.state !== "output-available") continue
        const output = part.output as { contact?: string; handedOff?: boolean }
        if (output?.handedOff && typeof output.contact === "string") {
          turns.push({ kind: "escalation", person: output.contact })
        }
        continue
      }

      // Everything else is visible work. Show it as soon as the arguments are
      // known rather than waiting for a result — a merchant watching a slow
      // search should see that something is happening.
      if (part.state === "input-streaming") continue
      turns.push({
        kind: "tool",
        tool: part.toolName,
        detail: describeInput(part.input),
      })
    }
  }

  return turns
}

/**
 * One short line describing what a tool was asked to do.
 *
 * Deliberately not JSON: the owner is glancing at a conversation, not reading
 * a payload. A single string argument is the common case (a search query) and
 * reads best raw.
 */
function describeInput(input: unknown): string {
  if (typeof input === "string") return input
  if (!input || typeof input !== "object") return ""

  const record = input as Record<string, unknown>
  for (const key of ["query", "q", "search", "reason", "text"]) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }

  const first = Object.values(record).find(
    (v) => typeof v === "string" && v.trim()
  )
  return typeof first === "string" ? first : ""
}
