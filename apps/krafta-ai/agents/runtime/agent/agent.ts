import { defineAgent } from "eve"
import { openai } from "@ai-sdk/openai"

/**
 * The tenant's agent — the one a merchant's customer actually talks to.
 *
 * One deployment serves every tenant. Nothing here is tenant-specific: the
 * persona, the tools and the playbooks are all resolved per session from the
 * caller's verified `tenantId` (see instructions/ and tools/). That is the
 * whole bet of this product — onboarding a business is writing rows, not
 * running a deploy.
 *
 * OpenAI direct rather than a model-id string through the AI Gateway. A string
 * id would route via Vercel's gateway and authenticate with project OIDC;
 * Krafta pays OpenAI directly, so we pass a provider-authored model and the
 * key comes from OPENAI_API_KEY.
 *
 * PER-TENANT MODEL SELECTION IS DELIBERATELY NOT WIRED, and this is a product
 * decision rather than an oversight. eve's `defineDynamic` model resolver only
 * accepts STRING model ids ("openai/gpt-5.5"), and a string id routes through
 * the Vercel AI Gateway. Krafta pays OpenAI directly, so choosing a model per
 * plan would silently move every conversation onto a different billing path.
 *
 * The knob to turn if that trade is worth it: switch this file to
 * `defineDynamic({ fallback: "openai/gpt-5-mini", events: { "session.started":
 * ... } })` and accept gateway routing. Until then the model is one env var
 * for the whole deployment.
 *
 * If it is ever made dynamic, resolve on `session.started` and not per turn —
 * prompt caches are keyed per model, so switching mid-session re-ingests the
 * whole conversation at uncached prices.
 */
export default defineAgent({
  model: openai(process.env.KRAFTA_AI_MODEL ?? "gpt-5-mini"),
  reasoning:
    (process.env.KRAFTA_AI_REASONING as "low" | "medium" | "high" | undefined) ??
    "low",

  /**
   * The per-SESSION ceiling, and it is load-bearing for cost — not tuning.
   *
   * The org spend cap in `lib/quota.ts` is checked at the HTTP boundary, once
   * per request. But one request opens a session that can run many model steps
   * (each tool call is another paid call), and nothing in that loop returns to
   * the door for permission. So without a limit here, a single POST from a
   * merchant whose retrieval tool keeps coming back empty can spend all night
   * on one connection while the org cap sits there having already said yes.
   *
   * eve's default is 40,000,000 input tokens per session — roughly $10 of
   * input at gpt-5-mini prices, on ONE conversation, against a $20 monthly cap
   * for the whole business. That default is sized for long-running coding
   * agents, not for a café answering questions about opening hours.
   *
   * 200k in / 20k out puts the worst a runaway session can cost at about nine
   * cents. A real support conversation does not come close: a persona plus
   * retrieved chunks is a few thousand tokens a turn, so this is roughly
   * twenty exchanges of headroom before the framework steps in.
   *
   * On an interactive session eve pauses and asks before continuing; on one
   * that cannot reach a human (a schedule, a subagent) it fails the next model
   * call outright. Both are stops. Neither is a silent bill.
   */
  limits: {
    maxInputTokensPerSession: 200_000,
    maxOutputTokensPerSession: 20_000,
  },
})
