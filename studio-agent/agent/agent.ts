import { defineAgent } from "eve";
import { openai } from "@ai-sdk/openai";

// OpenAI DIRECT — no Vercel AI Gateway. eve accepts a provider-authored
// LanguageModel, so we pass openai(...) (which calls OpenAI with OPENAI_API_KEY)
// instead of the gateway "openai/…" string. Founder requirement.
export default defineAgent({
  model: openai(process.env.STUDIO_AGENT_MODEL ?? "gpt-5.4"),
  reasoning: "high",
});
