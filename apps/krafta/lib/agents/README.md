# lib/agents

`ToolLoopAgent` instances built on AI SDK v6. Each agent consumes tools from `lib/tools/` and produces typed UI messages via `InferAgentUIMessage<typeof agent>`.

## Empty in Phase 1

This directory is scaffolded but unused in Phase 1 of the Localization Workbench (KRA-89 epic / KRA-90 + KRA-91 + KRA-92 + KRA-93). The future assistant ticket (KRA-95) populates it.

## Expected first occupant

```ts
// lib/agents/krafta-assistant.ts
import { ToolLoopAgent, InferAgentUIMessage, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createItemTool } from '../tools/create-item';
import { editItemTool } from '../tools/edit-item';
// ... all merchant-facing actions as tools

export const kraftaAssistant = new ToolLoopAgent({
  model: openai('gpt-5.4'),
  instructions: `You help merchants manage their Krafta catalog.
Always confirm destructive actions before taking them.`,
  tools: {
    createItem: createItemTool,
    editItem: editItemTool,
    // ...
  },
  stopWhen: stepCountIs(10),
});

export type KraftaAssistantUIMessage = InferAgentUIMessage<typeof kraftaAssistant>;
```

## Two surfaces, one brain

When the assistant ships, the same agent will be consumed by:

1. **In-app chat** at `app/api/chat/route.ts` — `useChat<KraftaAssistantUIMessage>()` with AI Elements components (`Conversation`, `Message`, `Tool`, `Confirmation`, `PromptInput`, etc.)
2. **Telegram bot** at `app/api/webhooks/telegram/route.ts` — Chat SDK (`chat` + `@chat-adapter/telegram` + `@chat-adapter/state-pg`) wraps the same agent for cross-platform deployment

Both surfaces re-use this directory's exports. Same tools. Same auth. Same outcomes. No duplicated business logic.

## Conventions

- One agent per file
- Always export the `InferAgentUIMessage<typeof X>` type alias for typed UI rendering
- `stopWhen: stepCountIs(N)` to bound agent loops (v6 — `maxSteps` was removed)
- `model: openai('gpt-5.4')` for capability-heavy agents; nano for cost-sensitive batch work (translation worker uses nano directly, not via an agent)

## Why not now

Phase 1 of the Localization Workbench ships a batch translation worker that calls `generateText` directly without a `ToolLoopAgent`. Translation is fidelity work, not decision-making — there's nothing for an agent to decide. Agents come into play when an LLM picks actions to take (the assistant), not when we're transforming a known input to a known output (translation).
