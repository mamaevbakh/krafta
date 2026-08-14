# CLAUDE.md

Guidance for Claude Code working in this repository.

# What this is

**Krafta AI** — every company in Uzbekistan builds its own AI agents: pick a template or describe it in Uzbek, and Krafta creates, verifies and runs it.

Separate repo, deliberately. It is **not** part of the `krafta` pnpm monorepo (`/Users/bakh/VSCode/krafta`) — that repo carries a live payments product and a production Supabase, and this one is allowed to move fast and be thrown away.

Target domain: `ai.krafta.org/uz` — the locale is a path segment, which is why routing is `app/[locale]/…`.

# Status: UI-first

**There is no backend.** No database, no eve, no model calls, no auth. Every screen renders from `lib/mock/data.ts`. That is the point — the interface is being designed and reviewed before a line of infrastructure is committed to.

When you add a screen, add its data to `lib/mock/data.ts` in the shape the real row would have (the design's §11 data model), not the shape that is convenient for the component. Those types are the contract the backend will have to meet.

Do not wire a real model, database or API without being asked.

# Commands

```bash
pnpm dev            # next dev (use preview_start with name "krafta-ai", port 3004)
pnpm build
pnpm typecheck      # tsc --noEmit
pnpm lint
```

**Never start a dev server with Bash.** `.claude/launch.json` defines it; use `preview_start` with the name `krafta-ai`.

# Design system

shadcn CLI v4, **preset `b0`** → style **`base-nova`**, base colour **neutral**, engine **Base UI** (`@base-ui/react`). Fonts are **Geist Sans** (body) and **Geist Mono** (money, counts, IDs, timestamps).

All 62 primitives are installed under `components/ui/`. Rules:

- **Compose what is there. Do not write custom primitives.** If a screen seems to need something new, it is almost always a composition of existing parts.
- **Never import `@radix-ui/*`.** It is not a dependency. Base UI part names differ: Dialog's overlay is `Backdrop`, polymorphism is `render` / `useRender`, not `asChild` + Slot.
- **Read the component file before using it.** base-nova's API differs from Radix-era shadcn in ways that will not surface until runtime.
- Install new primitives with the CLI from this directory so `components.json` picks the Base UI variant: `pnpm dlx shadcn@latest add <name>`. Never hand-paste primitive code.
- Switching the whole preset is one command and it reconfigures every installed component: `pnpm dlx shadcn@latest init --preset <code> -y -f --reinstall`. It resets fonts, so re-apply Geist afterwards with `pnpm dlx shadcn@latest add @shadcn/font-geist @shadcn/font-heading-geist`.

## The AI-agent primitives

shadcn ships a chat/agent kit — **use it instead of hand-rolling a transcript**:

| Primitive | Use for |
|---|---|
| `message` | the turn: `Message align="start"\|"end"`, avatar, content, header, footer |
| `bubble` | the speech bubble inside a turn, with reactions |
| `message-scroller` | scroll anchoring and jump-to-latest over a transcript |
| `marker` | **tool calls, escalations and status breaks in a conversation** — not messages |
| `attachment` | uploaded documents and inbound media |
| `questionnaire` | **guided setup wizards** — progress, choices, validation, prev/skip/next/submit |
| `input-group` | the composer: `InputGroupTextarea` + addons |
| `empty`, `spinner`, `item` | empty states, pending states, list rows |

## Gotchas that cost real time

All three are the same failure: a Radix-era shadcn habit that compiles fine and breaks at runtime.

- Base UI's `Button` asserts a native `<button>`. Anything that navigates must use `ButtonLink` (`components/console/button-link.tsx`), which passes `nativeButton={false}`. `<Button render={<Link/>}>` logs an accessibility warning on every render.
- `CardHeader` is a CSS grid that switches to two columns only when it contains a `CardAction`. Right-align a header action with `<CardAction>`, never with a flex override.
- **`DropdownMenuLabel` is Base UI's `Menu.GroupLabel` and must sit inside a `DropdownMenuGroup`.** Outside one it throws `MenuGroupContext is missing` at runtime — TypeScript will not catch it. Radix's `Label` is standalone, so this breaks on every copied menu.

The general rule: **a component that type-checks is not a component that runs.** Base UI leans on React context between compound parts far more than Radix did, and those contracts are invisible to `tsc`. Open any menu, dialog or select you have just written.

## Anti-slop

No purple gradients, no icon-circle grids, no decorative cards, no `font-extrabold`, no emoji as iconography. Neutral tokens only. Reference bar is Square and Stripe: dense, calm, information-first.

# Internationalization

Default locale is **Uzbek** — this product is pitched as the platform that speaks the language, so the untranslated state must be Uzbek, not English. Supported: UZ (Latin), RU, EN. UZ Cyrillic is not supported.

One hand-rolled catalogue at `lib/i18n/index.ts`: bounded key set, server-safe, no ICU. `Dict` is `typeof uz` **without `as const`** — the shape is the contract, the strings are not; adding `as const` turns every Uzbek value into a literal type and the other two catalogues stop typechecking.

- `getDict(locale)` for strings, `fill(template, values)` for `{placeholder}` interpolation.
- **Never hardcode a user-facing string in a component.** Adding a string means adding it to all three locales.
- Mock records carry their own `Record<"uz"|"ru"|"en", string>` fields — index them with `locale`.

# Conventions

- Money is UZS in **tiyin** (major unit × 100), matching the rest of Krafta. Render with `formatUzs()` and `font-mono tabular-nums`. Never show decimals on UZS.
- Params are async: `{ params }: { params: Promise<{ locale: Locale }> }`.
- Server Components by default. `"use client"` goes on the specific component holding state, never on a whole page.
- Page chrome is `PageHeader` + `PageBody` from `components/console/page-header.tsx`.
- Comments explain *why a decision was made and what breaks otherwise*. Don't narrate the obvious.
- Commits are conventional and outcome-framed: `feat(console): let the owner see which check is blocking publish`.

# Talking to the founder

Speak product and money, not engineering. Say what happens to a **merchant** or their **customer** and what it costs in trust, time or money. Lead with the outcome, cause second, file path only if it is the point. No `file:line` dumps. Recommend one option rather than surveying three. Say plainly when something is not done, not verified, or not safe.
