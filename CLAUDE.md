# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Repository shape

pnpm workspace monorepo (`apps/*`, `packages/*`, `templates/*`, `studio-agent`). Node `>=24.5 <25`. Every app is Next.js 16.2 (App Router) + React 19.2 + Tailwind 4 + TypeScript strict.

| App | Port | What it is |
|---|---|---|
| `apps/krafta` | 3000 | The merchant SaaS product: dashboard, catalogs, storefront, Telegram Mini App, delivery, AI assistant. |
| `apps/krafta-auth` | 3001 | `auth.krafta.org` — Krafta's own OIDC identity provider. Prod-only; dev shows the direct login form. |
| `apps/krafta-docs` | 3002 | Public docs site (Markdoc). |
| `apps/krafta-pay` | 3003 | Krafta Pay — hosted checkout, subscription billing engine, merchant billing console. Standalone product; Krafta is just its first client. |
| `apps/tasnif` | 3005 | `tasnif.krafta.uz` (not launched) — free, open search over Uzbekistan's national IKPU catalog, the product/service codes every receipt and e-invoice must carry. Data lives in schema `tasnif`; import scripts and plan in the app folder. Open-sourced at launch. |

| Package | What it is |
|---|---|
| `@krafta/supabase` | Supabase clients: `./client`, `./server`, `./auth`, `./proxy`, `./database.types`. Every app's session refresh goes through `updateSession` in `./proxy`. |
| `@krafta/payments-core` | Provider adapters (Atmos, Uzum, Click, Payme), subscription/renewal engine, outbound webhooks, secrets, log redaction. The billing brain — routes are thin wrappers over it. |
| `@krafta/auth-sso` | OIDC authorize-URL builder, PKCE, signed state. Used by the RP apps (`krafta`, `krafta-pay`). |
| `@krafta/commerce` | Typed public commerce client for generated/ejected Krafta Studio shops. Publishable key only — never the service-role path. |
| `@krafta/theme` | Reference copy of the design tokens (`src/styles.css`). **Declared as a dependency but not actually imported** — each app keeps its own copy of the token block in `app/globals.css`. Editing `packages/theme` propagates nowhere; edit the app's `globals.css`. |

# Commands

```bash
pnpm dev                              # all apps in parallel
pnpm --filter krafta-pay dev          # one app (or dev:krafta / dev:krafta-pay from root)
pnpm --filter krafta build
pnpm --filter krafta-pay lint         # eslint
pnpm --filter krafta exec tsc --noEmit   # typecheck (no typecheck script; run tsc directly)
```

Tests — vitest is deliberately narrow (node env, no jsdom, no testing-library, no mocking infra). It covers pure functions where a silent wrong answer is destructive: locale write routing, Atmos apply-outcome resolution, tax-identity validation, message-catalog completeness, subscription/platform-billing math.

```bash
pnpm --filter krafta test                                  # vitest run
pnpm --filter krafta-pay test
pnpm --filter @krafta/payments-core test
pnpm --filter krafta exec vitest run lib/catalogs/i18n.test.ts   # single file
pnpm --filter krafta exec playwright test e2e/storefront-404.spec.ts --workers=1
```

E2E specs live in `apps/krafta/e2e/` and each mint anonymous Supabase sessions. The hosted dev project caps anonymous sign-ins at 30/hour — run one spec with `--workers=1` when iterating, never loop the suite.

**Never start a dev server with Bash.** `.claude/launch.json` defines all four; use `preview_start` with the app name. The merchant usually already has `krafta` running on 3000.

# Architecture

## The three "customer" concepts (do not conflate)

| Table | Who it represents |
|---|---|
| `commerce.customers` | End-customers of merchants — the diner ordering a coffee. Order ownership, order history, dine-in guest sessions. |
| `payments.customers` | Krafta Pay's customers — merchants using Krafta Pay as their processor. Merchant-scoped by `external_id`. Acquirer routing, payouts, KYC. |
| `billing.customers` (future) | Krafta's own paying merchants — orgs on a Krafta SaaS plan. |

Read the schema name when in doubt. `commerce.*` is the merchant's ordering domain, `payments.*` is the payments product, `billing.*` is Krafta's own SaaS billing. Full rationale in [AGENTS.md](AGENTS.md) and [docs/adr/0001-orders-catalog-schema-v1.md](docs/adr/0001-orders-catalog-schema-v1.md).

## Data layer

One hosted Supabase project, schemas `public`, `commerce`, `payments` (exposed via `supabase/config.toml`), plus `agent` (Krafta AI) and `tasnif` (the public IKPU catalog; service role only, not exposed). Edge functions (`embed`, `embed_query`, `translate-worker`) back catalog search embeddings and translation.

**There is no dev database.** The dev branch was retired on 2026-09-17 and is not coming back; every migration goes to prod (`hlmcoirjaydrfqcmnuun`), which carries live shops and live payments. So:

- Every schema change is a timestamped file in `supabase/migrations/`, committed to git. Nothing is applied to the database without its file.
- Before applying, run the file inside a `DO` block that ends in `RAISE EXCEPTION` with your assertions, so it executes for real and then rolls back.
- Apply the committed file with the Supabase MCP `apply_migration`, then `update supabase_migrations.schema_migrations set version = '<file timestamp>'` on the row it created (it records its own timestamp otherwise, and history drifts from the repo).
- Put the rollback in `supabase/rollback/<version>_<name>.down.sql`, never inside `migrations/`.

Row money is stored in `*_cents` columns as **major unit × 100 for every currency, UZS included**. There is no zero-decimal special case.

## Multi-tenancy and auth

- Session refresh runs in `proxy.ts` (Next 16 renamed middleware — the file is `proxy.ts` exporting `proxy()`, there is no `middleware.ts`), delegating to `@krafta/supabase/proxy`.
- Krafta dashboard routes are `/dashboard/[orgSlug]`; Krafta Pay's are `/dashboard/org/[orgSlug]`.
- Krafta Pay authorizes the slug **once**, in `requireOrgAccess` ([src/lib/org-access.ts](apps/krafta-pay/src/lib/org-access.ts)), before the page renders. A slug the user cannot access returns **404, never 403** — a 403 is an enumeration oracle over the merchant list. Do not reintroduce `?orgId=` query params.
- SSO is prod-only. `hasSsoRuntimeConfig()` gates it; on dev the apps fall back to the direct login form.

## Krafta Pay API surface

Four distinct route families, each with its own auth model — do not mix them:

| Route family | Auth | Caller |
|---|---|---|
| `/api/v1/*` | Merchant API key, `krp_test_` / `krp_live_` bearer | External merchants (public, documented in [docs/krafta-pay-api.md](docs/krafta-pay-api.md)) |
| `/api/internal/*` | Internal shared secret / HMAC | Krafta's own apps + Vercel cron |
| `/api/dashboard/*` | Supabase session + org membership | The billing console UI |
| `/api/webhooks/[provider]` | Provider signature verification | Acquirers (Atmos, Uzum) |

`src/lib/v1.ts` is the tenancy boundary for the public API: it authenticates, scopes every query by `auth.merchantOrgId` + `environment`, and maps thrown errors to the documented envelope. A v1 route that queries without going through it can leak another merchant's billing data.

**Test vs live is a property of the checkout session**, fixed at creation from the API key — not a process global. `PAY_ENV` survives only as a fallback for pre-column sessions. Resolving the wrong one charges a real card.

Architecture reference: [docs/krafta-pay-platform-reference.md](docs/krafta-pay-platform-reference.md). Platform billing (Krafta Pay billing its own merchants): [docs/krafta-pay-platform-billing.md](docs/krafta-pay-platform-billing.md).

## Path alias gotcha

`apps/krafta` maps `@/*` → `./*`. **`apps/krafta-pay` maps `@/*` → `["./src/*", "./*"]`** — first match wins, so `@/lib/api-keys` resolves to `src/lib/api-keys.ts` while `@/lib/format` resolves to `lib/format.ts` at the app root. A tool that assumes a single root will fail with "Cannot find package", which reads like a missing dependency rather than a path-mapping bug (see the resolver in [apps/krafta-pay/vitest.config.ts](apps/krafta-pay/vitest.config.ts)).

## Internationalization

Default locale is **Russian**. Supported: RU, UZ (Latin), EN. UZ Cyrillic is not supported.

Never hardcode user-facing English in a component. Three catalogs, all hand-rolled (bounded key sets, server-safe, no ICU dependency):

- `apps/krafta/lib/locales/` — storefront / customer-facing.
- `apps/krafta/lib/locales/dashboard/namespaces/` — merchant dashboard, per-namespace, via `useT` / `getDashboardT` (cookie `krafta_dash_locale`).
- `apps/krafta-pay/src/lib/locales/` — merchant console + hosted checkout + portal.

Adding a string means adding it to **all three locales** in the catalog, not just the one you're testing.

# Design system

**Read [DESIGN.md](DESIGN.md) before any visual or UI change.** It is the source of truth for fonts, oklch color tokens, spacing, radii, motion, layout, and the anti-slop hard rules. Do not deviate without explicit user approval. In QA mode (`/qa`, `/qa-only`, `/design-review`), flag any code that does not match.

Everything in DESIGN.md applies to **all four apps**: same Geist Sans / Geist Mono / Helvetica-Neue-Bold-wordmark typography, same oklch neutral token set, same `font-mono tabular-nums` for UZS money, same composition-over-configuration rules, same anti-slop guardrails, same Square-as-reference bar for merchant surfaces.

## Krafta Pay's one deviation: shadcn on Base UI

`apps/krafta` (and `krafta-auth`) run shadcn `new-york` / base `zinc`, built on **Radix**. `apps/krafta-pay` runs shadcn **`base-vega`** / base `neutral`, built on **Base UI** (`@base-ui/react`) — see [apps/krafta-pay/components.json](apps/krafta-pay/components.json). `apps/krafta-docs` is `base-nova`, also Base UI.

What this means in `apps/krafta-pay`:

- **Never import `@radix-ui/*` there.** It isn't a dependency; there are zero Radix imports in the app today. Primitives come from `@base-ui/react/<part>` (`button`, `dialog`, `menu`, `select`, `radio-group`, `separator`, `toast`, `input`, `alert-dialog`, plus `merge-props` / `use-render`).
- Base UI's part names differ from Radix's: Dialog's overlay is `DialogPrimitive.Backdrop`, not `Overlay`; polymorphism is `render` / `useRender`, not `asChild` + Slot. Copying a component wholesale from `apps/krafta/components/ui/` will not compile — check `apps/krafta-pay/components/ui/` first (23 primitives installed).
- Install new primitives with the shadcn CLI **from inside the app** so `components.json` picks the Base UI variant: `pnpm dlx shadcn@latest add <name>` in `apps/krafta-pay/`. Never hand-paste primitive code.
- `apps/krafta-pay/app/globals.css` imports `shadcn/tailwind.css` and the landing's own palette (`components/landing/landing.css`) on top of the shared token block. Tailwind 4 resolves `@theme` at build time, so a new palette has to be an `@import` from `globals.css` — a JS import from a component leaves the page unstyled.

Everything else — colors, type, spacing, the ban on purple gradients / icon-circle grids / decorative cards / `font-extrabold` — is identical to Krafta.

DESIGN.md §Components carries the same split as a table (per-app style, base color, engine, primitive count) plus hard rule 3, "one headless engine per app". Ratified 2026-08-04 in its Decisions Log.

# Debugging the running dev server (read this BEFORE asking the user)

Next.js 16 exposes a built-in MCP endpoint on the dev server. Use **`mcp__next-devtools__*` tools first** for any runtime debugging — server-action errors, slow renders, RSC issues, "the page reloads", redirect loops, what the user is currently looking at. Never ask the user to paste logs the MCP can fetch.

```ts
// 1. Initialize MCP context (once per session).
mcp__next-devtools__init({ project_path: "/Users/bakh/VSCode/krafta/apps/krafta" })

// 2. Discover running servers + their available runtime tools.
mcp__next-devtools__nextjs_index({ port: "3000" })

// 3. Pull what you actually want.
mcp__next-devtools__nextjs_call({ port: "3000", toolName: "get_errors" })
mcp__next-devtools__nextjs_call({ port: "3000", toolName: "get_page_metadata" })
```

| Tool | What it returns |
|---|---|
| `get_errors` | Live `configErrors` + `sessionErrors` with **source-mapped stack traces**. Empty = no current errors. |
| `get_page_metadata` | Active browser sessions: URL + segment tree. Tells you what the user is looking at right now. |
| `get_logs` | Path to the structured dev log file. Read with the Read tool. |
| `get_routes` | Full app + pages router inventory. |
| `get_server_action_by_id` | Resolve an action-ID hash from the manifest to filename + export. |
| `get_project_metadata` | Project path + dev URL. |

For live DOM inspection / clicking / screenshotting, use the `/browse` skill (`$B click`, `$B snapshot -D`, `$B screenshot`). Drive `/browse` and read `get_errors` / `get_page_metadata` in the same loop.

Fallback only when the MCP can't answer (rare — usually it can): the merchant runs `pnpm --filter krafta dev:log`, which tees output to `/tmp/krafta-dev.log`. Useful for historical timelines `get_errors` doesn't retain.

What NOT to do:

- Don't start your own background `next dev` — it'll port-conflict with theirs.
- Don't ask the user to paste log output `get_errors` or `get_page_metadata` can fetch.
- Don't trust training-era Next.js knowledge — use `mcp__next-devtools__nextjs_docs` with paths from `nextjs-docs://llms-index`, or the local index in [AGENTS.md](AGENTS.md) / `.next-docs/`.

# Talking to me

**Speak product, not engineering.** I am the founder. I decide what we build and what it costs; I do not need to read the code to judge that. Write to me the way you would brief someone who owns the business, not the way you would annotate a pull request.

Say what happens to a **merchant** or their **customer**, and what it costs in money, trust, or time:

> A customer pays, the money leaves their card, and their order still says "waiting". They call the merchant, the merchant has nothing to tell them.

Not:

> `markPaymentFailed` (subscription.ts:1728) writes `status: "failed"` with no pre-read, so a retransmitted callback flips the intent.

Rules:

- **Lead with the outcome.** The consequence first, the cause second, the file path only if I ask or if I need it to act.
- **No `file:line` dumps.** One or two references are fine when they're the point. A wall of them is noise — keep that depth in commits, comments, and the task list, which is where it belongs.
- **Name real people.** "Galaktika can't see whether the tuition was paid." Not "the merchant dashboard surface lacks a status affordance."
- **Money in money terms.** Say "the customer is charged twice" or "their funds are frozen and nobody can release them", not "double capture" or "an uncaptured authorization hold" without the plain-language version alongside.
- **Give me the decision, not the survey.** Recommend one option and say why. If something is blocked, say who unblocks it and what it costs to wait.
- **Say plainly when something is not done, not verified, or not safe.** Never dress up a partial result. "I couldn't test this" is a fine sentence.
- **Skip the internal machinery.** How the work got done — agents, workflows, review passes — matters to me only when it changed the answer.

Depth is still expected *in the work*: commit messages, code comments, and tests stay as rigorous as the rest of this file demands. This is about what reaches me in chat.

# Conventions

- **Commits** are conventional and outcome-framed, scoped by app: `feat(krafta-pay): make the subscription pay link recoverable`, `fix(api): close cross-tenant storage delete in item media POST/DELETE`. Describe what changed for the user, not the mechanism.
- **Comments** in this codebase explain *why a decision was made and what breaks otherwise*, often at length (see `src/lib/v1.ts`, `checkout-environment.ts`, `vitest.config.ts`). Match that when touching load-bearing logic; don't narrate the obvious.
- **`apps/krafta/next.config.ts` runs `cacheComponents: true`.** Request-dynamic metadata streams into `<body>` under Suspense, which non-JS crawlers don't hoist — that's why the search-console verification tags are literal `<meta>` in the root layout rather than Metadata API output.

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

- Product ideas/brainstorming → `/office-hours`
- Strategy/scope → `/plan-ceo-review`
- Architecture → `/plan-eng-review`
- Design system/plan review → `/design-consultation` or `/plan-design-review`
- Full review pipeline → `/autoplan`
- Bugs/errors → `/investigate`
- QA/testing site behavior → `/qa` or `/qa-only`
- Code review/diff check → `/review`
- Visual polish → `/design-review`
- Ship/deploy/PR → `/ship` or `/land-and-deploy`
- Save progress → `/context-save`
- Resume context → `/context-restore`
