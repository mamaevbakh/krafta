import { defineAgent } from "eve";
import { openai } from "@ai-sdk/openai";

// OpenAI DIRECT — no Vercel AI Gateway. eve accepts a provider-authored
// LanguageModel, so we pass openai(...) (which calls OpenAI with OPENAI_API_KEY)
// instead of the gateway "openai/…" string. Founder requirement.
//
// Coding model: gpt-5.3-codex — a code-specialized model, stronger on the
// framework-correctness class of bug (Server/Client boundaries, dependency
// versions) than gpt-5-mini. Override via STUDIO_AGENT_MODEL (e.g. "gpt-5-mini"
// for the cheapest/fastest tier, or "gpt-5.4" for the big general model).
// Reasoning effort: default "medium" — "high" is wasteful on routine
// restyles/edits. Bump to "high" for a hard build via STUDIO_AGENT_REASONING.
const REASONING =
  (process.env.STUDIO_AGENT_REASONING as "low" | "medium" | "high" | undefined) ??
  "medium";

export default defineAgent({
  model: openai(process.env.STUDIO_AGENT_MODEL ?? "gpt-5.3-codex"),
  reasoning: REASONING,
});
