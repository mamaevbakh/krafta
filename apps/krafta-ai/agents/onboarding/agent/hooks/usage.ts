import { defineHook } from "eve/hooks"

import { recordTurnUsage } from "../lib/quota"

/**
 * Meters what each business actually spends.
 *
 * This is the till, not the door. It cannot refuse anything — eve hooks are
 * observe-only, and by the time `step.completed` fires the tokens are bought
 * and paid for. Its only job is to make the NEXT `checkQuota` tell the truth,
 * which is why a cap can overshoot by the turns already in flight when it is
 * crossed. That overshoot is bounded and deliberate; the alternative is holding
 * a lock across a model call.
 *
 * `step.completed` and not `turn.completed`: usage rides on the step. One turn
 * is several steps when the agent calls tools, and each of those steps is a
 * separate model call that OpenAI charges for. Metering per turn would
 * undercount a tool-using conversation by exactly the amount that makes tool
 * use look free.
 *
 * SANDBOXED RUNS ARE METERED TOO. A verification run is seven real
 * conversations against a real model — the audit log excludes them because
 * they are not merchant activity, but the invoice does not care about that
 * distinction. Exempting them would leave the most automatable path through
 * the product uncapped.
 */

/**
 * Token counts off a step, defensively.
 *
 * The shape is `event.data.usage?: { inputTokens?, outputTokens?,
 * cacheReadTokens?, cacheWriteTokens?, costUsd? }`. Every field is optional and
 * `usage` is omitted WHOLESALE — not zero-filled — when the provider reported
 * nothing. A step with no usage is normal, not an error.
 *
 * There is no `totalTokens`, `promptTokens` or `cachedInputTokens` here: eve
 * normalises the AI SDK's usage down to those five keys and drops the rest.
 *
 * `cacheReadTokens` is a BREAKDOWN of `inputTokens`, not an addition to it —
 * it comes from the SDK's `inputTokenDetails`, and eve's own accumulator keeps
 * the two as parallel counters without subtracting. So it is passed through
 * separately for pricing (the provider bills cached input at about a tenth)
 * and never added to the input total. Add it and every merchant's bill
 * inflates on exactly the conversations that were cheapest.
 *
 * `costUsd` is ignored: it is only populated when the Vercel AI Gateway served
 * the call, and Krafta pays OpenAI directly.
 */
function tokensFrom(
  usage: unknown
): { input: number; cached: number; output: number } | null {
  if (!usage || typeof usage !== "object") return null
  const u = usage as Record<string, unknown>

  const input = typeof u.inputTokens === "number" ? u.inputTokens : 0
  const output = typeof u.outputTokens === "number" ? u.outputTokens : 0
  const cached = typeof u.cacheReadTokens === "number" ? u.cacheReadTokens : 0
  if (input === 0 && output === 0) return null

  return { input, cached, output }
}

export default defineHook({
  events: {
    async "step.completed"(event, ctx) {
      const caller = ctx.session.auth.current
      const tenantId = caller?.attributes.tenantId
      // Spend that cannot be attributed to a business is not charged to a
      // random one. It still shows up on the provider's bill, which is what
      // the platform-wide cap at OpenAI is for.
      if (typeof tenantId !== "string") return

      const tokens = tokensFrom(
        (event.data as { usage?: unknown } | undefined)?.usage
      )
      if (!tokens) return

      // One TURN is counted on the first step only. The daily allowance is
      // expressed in replies a customer received, not in model round trips —
      // a merchant whose agent uses three tools has had one conversation, and
      // charging them three against their daily count would make tool-using
      // agents mysteriously run out faster.
      const stepIndex = (event.data as { stepIndex?: unknown } | undefined)
        ?.stepIndex
      const isFirstStep = typeof stepIndex === "number" ? stepIndex === 0 : true

      await recordTurnUsage({
        orgId: tenantId,
        inputTokens: tokens.input,
        cachedInputTokens: tokens.cached,
        outputTokens: tokens.output,
        turns: isFirstStep ? 1 : 0,
      })
    },

    /**
     * A session opening is worth counting on its own: it is the closest thing
     * the ledger has to "a customer started talking to us", and it is what a
     * conversation-based price would eventually be billed on.
     */
    async "session.started"(_event, ctx) {
      const tenantId = ctx.session.auth.current?.attributes.tenantId
      if (typeof tenantId !== "string") return

      await recordTurnUsage({
        orgId: tenantId,
        inputTokens: 0,
        outputTokens: 0,
        turns: 0,
        sessions: 1,
      })
    },
  },
})
