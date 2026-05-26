# Design System

Always read [DESIGN.md](./DESIGN.md) before making any visual or UI decisions. All font choices, colors (oklch), spacing, radii, and aesthetic direction are defined there. Do not deviate without explicit user approval. In QA mode (`/qa`, `/qa-only`, `/design-review`), flag any code that does not match.

# Debugging the running dev server (read this BEFORE asking the user)

Next.js 16 exposes a built-in MCP endpoint on the dev server. Use **`mcp__next-devtools__*` tools first** for any runtime debugging — server-action errors, slow renders, RSC issues, "the page reloads", redirect loops, what the user is currently looking at. Never ask the user to paste logs that the MCP can fetch.

## First-touch workflow

```ts
// 1. Initialize MCP context (once per session).
mcp__next-devtools__init({ project_path: "/Users/bakh/VSCode/krafta/apps/krafta" })

// 2. Discover running servers + their available runtime tools.
mcp__next-devtools__nextjs_index({ port: "3000" })

// 3. Pull what you actually want.
mcp__next-devtools__nextjs_call({ port: "3000", toolName: "get_errors" })
mcp__next-devtools__nextjs_call({ port: "3000", toolName: "get_page_metadata" })
```

## What the runtime tools give you

| Tool | What it returns |
|---|---|
| `get_errors` | Live `configErrors` + `sessionErrors` arrays with **source-mapped stack traces**. Empty = no current errors. |
| `get_page_metadata` | Active browser sessions: URL + segment tree (layouts / page / boundaries). Tells you what the user is looking at right now. |
| `get_logs` | Path to the structured dev log file. Read with the Read tool. |
| `get_routes` | Full app + pages router inventory. |
| `get_server_action_by_id` | Resolve an action ID from the manifest to filename + export. Useful when the browser surfaces a server-action error referencing only the hash. |
| `get_project_metadata` | Project path + dev URL. |

## Browser automation

For live DOM inspection / clicking / screenshotting, the `/browse` skill is still the right tool (`$B click`, `$B snapshot -D`, `$B screenshot`). Drive `/browse` and read `get_errors` / `get_page_metadata` in the same loop — that's how the cart-stepper variation-id bug got caught.

## Fallback: the log file

Only use `/tmp/krafta-dev.log` when the MCP tools can't answer the question (rare — usually they do):

The merchant runs:
```bash
pnpm --filter krafta dev:log
```

That tees `next dev` output to `/tmp/krafta-dev.log`. Useful for historical timelines that `get_errors` doesn't retain.

## What NOT to do

- Don't start your own background `next dev` — it'll port-conflict with theirs.
- Don't ask the user to paste log output when `get_errors` or `get_page_metadata` can answer the question.
- Don't trust your training-era Next.js knowledge — use `mcp__next-devtools__nextjs_docs` with paths from `nextjs-docs://llms-index` for any framework question.

# gstack

Use the `/browse` skill from gstack for all web browsing. Do **not** use any `mcp__claude-in-chrome__*` tools.

Available gstack skills:

- `/office-hours`
- `/plan-ceo-review`
- `/plan-eng-review`
- `/plan-design-review`
- `/design-consultation`
- `/design-shotgun`
- `/design-html`
- `/review`
- `/ship`
- `/land-and-deploy`
- `/canary`
- `/benchmark`
- `/browse`
- `/connect-chrome`
- `/qa`
- `/qa-only`
- `/design-review`
- `/setup-browser-cookies`
- `/setup-deploy`
- `/setup-gbrain`
- `/retro`
- `/investigate`
- `/document-release`
- `/document-generate`
- `/codex`
- `/cso`
- `/autoplan`
- `/plan-devex-review`
- `/devex-review`
- `/careful`
- `/freeze`
- `/guard`
- `/unfreeze`
- `/gstack-upgrade`
- `/learn`

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
