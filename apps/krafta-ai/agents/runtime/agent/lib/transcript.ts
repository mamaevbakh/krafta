import { createClient } from "@supabase/supabase-js"

/**
 * The transcript — what the agent actually said to a customer.
 *
 * A merchant's first question about an AI answering their customers is never
 * "how many tokens did it use". It is "what did it SAY to them". Without this
 * there is no answer to that, no way to catch the agent being wrong before a
 * customer does, and no evidence when someone claims they were promised a
 * refund.
 *
 * Everything goes through `agent.record_message`, which opens the conversation
 * on the first write and appends after that. One round trip per message, and
 * the database — not this file — decides the billing period and whether a
 * conversation counts, so a caller cannot mis-bill by passing the wrong thing.
 */

export type TranscriptRole = "user" | "assistant" | "tool" | "system" | "escalation"

/** Where a conversation came from. Only `customer` is ever billable. */
export type TranscriptOrigin = "customer" | "preview" | "verification"

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("missing_supabase_admin_credentials")
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "agent" },
  })
}

export async function recordMessage(params: {
  orgId: string
  sessionId: string
  role: TranscriptRole
  agentId?: string | null
  content?: string | null
  origin?: TranscriptOrigin
  channel?: "web" | "telegram" | "widget"
  channelRef?: string | null
  externalUserId?: string | null
  toolName?: string | null
  toolDetail?: string | null
  escalatedTo?: string | null
  lang?: "uz" | "ru" | "en" | null
  model?: string | null
  inputTokens?: number
  outputTokens?: number
  latencyMs?: number | null
}): Promise<void> {
  try {
    const { error } = await admin().rpc("record_message", {
      p_org_id: params.orgId,
      p_session_id: params.sessionId,
      p_role: params.role,
      p_agent_id: params.agentId ?? null,
      p_content: params.content ?? null,
      p_origin: params.origin ?? "customer",
      p_channel: params.channel ?? "web",
      p_channel_ref: params.channelRef ?? null,
      p_external_user_id: params.externalUserId ?? null,
      p_tool_name: params.toolName ?? null,
      p_tool_detail: params.toolDetail ?? null,
      p_escalated_to: params.escalatedTo ?? null,
      p_lang: params.lang ?? null,
      p_model: params.model ?? null,
      p_input_tokens: Math.max(0, Math.round(params.inputTokens ?? 0)),
      p_output_tokens: Math.max(0, Math.round(params.outputTokens ?? 0)),
      p_latency_ms: params.latencyMs ?? null,
    })

    /*
      LOUD ON FAILURE, even though the failure is tolerated.

      The first version of this swallowed everything, and it cost real time:
      the transcript recorded nothing at all, the conversation looked perfect
      from the outside, and there was no signal anywhere. The actual cause was
      a NOT NULL on conversations.agent_id — a one-line fix hidden behind a
      bare catch.

      Silence is the right behaviour for the CUSTOMER and the wrong behaviour
      for us. So: never throw, always log.
    */
    if (error) {
      console.warn("[krafta-ai] transcript write failed", {
        sessionId: params.sessionId,
        role: params.role,
        code: error.code,
        message: error.message,
      })
    }
  } catch (cause) {
    // Never break a live conversation to write history. A dropped line leaves
    // a gap in the transcript; a thrown error leaves a customer staring at a
    // failure. Same trade as the audit log — best-effort, not authoritative.
    // If it ever has to settle a billing dispute it moves onto the message
    // path where it can fail loudly.
    console.warn("[krafta-ai] transcript write threw", {
      sessionId: params.sessionId,
      role: params.role,
      cause: cause instanceof Error ? cause.message : String(cause),
    })
  }
}

/**
 * Reads a token count off a `step.completed` event without trusting its shape.
 *
 * `web_search` has no local executor and usage comes from the model provider,
 * so this payload belongs to the provider and the AI SDK, not to us — the
 * field names have already differed between shapes (`inputTokens`,
 * `promptTokens`, `usageInputTokens`). Accepting several and defaulting to
 * zero means a rename costs us a metric, not a broken conversation.
 */
export function readUsage(data: unknown): {
  inputTokens: number
  outputTokens: number
} {
  const empty = { inputTokens: 0, outputTokens: 0 }
  if (!data || typeof data !== "object") return empty

  const record = data as Record<string, unknown>
  const usage =
    (record.usage && typeof record.usage === "object"
      ? (record.usage as Record<string, unknown>)
      : record) ?? record

  const num = (...keys: string[]): number => {
    for (const key of keys) {
      const value = usage[key] ?? record[key]
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        return Math.round(value)
      }
    }
    return 0
  }

  return {
    inputTokens: num("inputTokens", "promptTokens", "usageInputTokens", "input_tokens"),
    outputTokens: num("outputTokens", "completionTokens", "usageOutputTokens", "output_tokens"),
  }
}
