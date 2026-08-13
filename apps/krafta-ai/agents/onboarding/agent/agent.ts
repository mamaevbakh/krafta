import { defineAgent } from "eve"
import { openai } from "@ai-sdk/openai"

/**
 * The onboarding agent — the "describe it in your own words" door.
 *
 * It talks to the business OWNER, not to their customers, and its job is to
 * turn a sentence like "mijozlar Telegramda buyurtma holatini so'raydi" into a
 * configured agent: match the nearest template, ask only the questions that
 * template actually needs, and hand off to the verification run.
 *
 * Deliberately NOT named "studio" — Krafta Studio is the (paused) shop-codegen
 * agent in the main Krafta repo and has nothing to do with this product. The
 * original design document used "studio" for this role; the name is taken.
 */
export default defineAgent({
  model: openai(process.env.KRAFTA_AI_ONBOARDING_MODEL ?? "gpt-5-mini"),
  reasoning: "medium",

  /**
   * Tighter than the runtime agent's, because this conversation is shorter by
   * design: the instructions tell it to ask at most one question before
   * proposing. An onboarding session that has burned 60k input tokens has
   * stopped converging and is costing the owner time as well as our money.
   *
   * The reasoning behind having a session limit at all — that the org spend cap
   * is only checked at the HTTP door, and one request can run many paid model
   * steps behind it — is written out in the runtime agent's agent.ts.
   */
  limits: {
    maxInputTokensPerSession: 60_000,
    maxOutputTokensPerSession: 10_000,
  },
})
