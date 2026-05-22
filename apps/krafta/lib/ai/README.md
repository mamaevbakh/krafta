# lib/ai

Shared AI SDK v6 infrastructure for Krafta.

## Rules

- **Never import `from "openai"` directly.** Use `@ai-sdk/openai` (the AI SDK provider package). Direct OpenAI SDK imports are flagged as errors by the `vercel/ai-elements` toolchain.
- **Never import `from "@anthropic-ai/sdk"` or `from "anthropic"` directly.** Same reasoning — use `@ai-sdk/anthropic` if we ever add Anthropic as a fallback provider.
- **No AI Gateway** — founder decision (cost-conscious). We call providers directly with their own API keys via the `@ai-sdk/*` provider packages.
- **All AI calls happen server-side.** Never expose `OPENAI_API_KEY` to the browser. AI SDK calls live in: `lib/translation/` (worker), `app/api/chat/route.ts` (future assistant), Supabase Edge Functions.

## Knowledge corrections (training data is stale)

The AI SDK had a major version bump (v5 → v6). Common training-data patterns that are now WRONG:

| v5 / training data | v6 (current) |
|---|---|
| `generateObject({ schema })` | `generateText({ output: Output.object({ schema }) })` |
| `streamObject({...})` | `streamText({ output: Output.object() })` |
| `tool({ parameters: z.object(...) })` | `tool({ inputSchema: z.object(...) })` |
| `maxSteps: 5` | `stopWhen: stepCountIs(5)` |
| `maxTokens: 500` | `maxOutputTokens: 500` |
| `Experimental_Agent` | `ToolLoopAgent` |
| `useChat({ api: '/x' })` | `useChat({ transport: new DefaultChatTransport({ api: '/x' }) })` |
| `result.toDataStreamResponse()` | `result.toUIMessageStreamResponse()` (chat) or `toTextStreamResponse()` (text-only) |
| `message.content` | `message.parts` |
| `CoreMessage` | `ModelMessage` + `convertToModelMessages()` |

See the design doc `~/.gstack/projects/mamaevbakh-krafta/bakh-dev-design-localization-workbench-20260521-161254.md` § "AI SDK v6 — Knowledge Corrections" for the full list.

## Files

(Phase 1 / KRA-91 scaffolds this directory; concrete files added as needed.)

## Future

When the in-app + Telegram assistant ships (KRA-95), this directory may grow to include shared provider config, retry helpers, observability hooks, etc.
