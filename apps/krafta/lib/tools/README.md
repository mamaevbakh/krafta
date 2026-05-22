# lib/tools

AI SDK tool wrappers — one file per tool. Each tool wraps an existing server action so the AI assistant can invoke "anything a merchant can do" with the same auth + business logic a human user gets.

## Empty in Phase 1

This directory is scaffolded but unused in Phase 1 (KRA-89 epic / KRA-90 Slice 1 / KRA-91 Slice 2). The future assistant ticket (KRA-95) populates it.

## Expected pattern (when assistant ships)

```ts
// lib/tools/create-item.ts
import { tool, UIToolInvocation } from 'ai';
import { z } from 'zod';
import { createItem } from '@/app/dashboard/[orgSlug]/[catalogSlug]/items/_components/actions';

export const createItemTool = tool({
  description: 'Create a new item in a catalog with name, price, category.',
  inputSchema: z.object({
    catalogId: z.string().uuid(),
    categoryId: z.string().uuid(),
    name: z.string().min(1).max(200),
    priceCents: z.number().int().nonnegative(),
    description: z.string().max(2000).nullable().optional(),
  }),
  execute: async (input) => {
    // Reuses the existing server action — same RLS, same validation
    return await createItem({ ...input });
  },
});

// Export the invocation type for the UI components
export type CreateItemToolInvocation = UIToolInvocation<typeof createItemTool>;
```

## Conventions

- One tool per file, lowercase-kebab named (e.g. `create-item.ts`)
- Zod `inputSchema` (NOT `parameters` — that's v5)
- `execute` calls the same server action a human would invoke
- Export an `UIToolInvocation<typeof tool>` type alias for typed UI rendering
- `_shared/` holds reusable Zod schemas / helpers across multiple tools

## Consumers

When this directory is populated:
- `lib/agents/krafta-assistant.ts` (in-app + Telegram)
- `lib/translation/worker.ts` could use specific translation tools

Phase 1 worker does NOT use tools — it calls `generateText` directly. Tools come into play when an AI is making decisions about which actions to invoke (the assistant), not when we're just transforming text (the translation worker).
