import { defineAgent } from "eve";
import { openai } from "@ai-sdk/openai";

// OpenAI DIRECT — no Vercel AI Gateway. eve accepts a provider-authored
// LanguageModel, so we pass openai(...) (which calls OpenAI with OPENAI_API_KEY)
// instead of the gateway "openai/…" string. Founder requirement.
//
// Coding model: gpt-5-mini — far cheaper/faster than gpt-5.4 while still strong
// enough to build the coded Next.js shops. Override via STUDIO_AGENT_MODEL (e.g.
// "gpt-5-nano" for the cheapest tier, or "gpt-5.4" to go back to the big model).
export default defineAgent({
  model: openai(process.env.STUDIO_AGENT_MODEL ?? "gpt-5-mini"),
  reasoning: "high",
});
