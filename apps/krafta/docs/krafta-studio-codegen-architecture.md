# Krafta Studio — Codegen Builder Architecture

**Status:** Plan of record, 2026-06-29 · grounded in Vercel Sandbox docs + the existing engine. Decision: full codegen sandbox (literal v0/Bolt), eject-yes. Supersedes the enum-`applyDesign` approach for structure (that stays as a fast restyle path).

## The shape

A merchant describes a shop; an AI **coding agent** generates and iterates on a **real Next.js project** running in a **Vercel Sandbox**, with a live preview, and deploys it to `merchant-name.krafta.org`. The agent writes real, ejectable code (shadcn-first) — but every commerce operation routes through `@krafta/commerce`, our key-gated client to the engine. **The engine is the rail:** the agent can render commerce data and restyle 100%, but can never compute money, build its own cart, or touch the DB. That single invariant keeps every total honest on a structure we've never seen.

## Critical path (bottom-up — each layer needs the one below)

1. **Public commerce API + `@krafta/commerce` client** — the foundation. A sandboxed/ejected shop has no cookie session and can't hold the service-role key, so it calls a public, key-gated HTTP API.
2. **The shop starter template** — the real Next 16 + shadcn project the agent scaffolds from and freely restyles.
3. **The codegen agent** — AI SDK v6 file-tool loop (write/edit/read/list/move/delete + addDependency + runCommand + readLogs), edit→run→fix.
4. **Sandbox runtime + live preview** — Vercel Sandbox boots the project, `sandbox.domain(3000)` → preview iframe beside the chat.
5. **Deploy to subdomain** — Vercel for Platforms → `merchant-name.krafta.org`.

What we've already built feeds straight in: the org-gated Studio agent + chat UI (layers 3/4 reuse it), the `lib/commerce-sdk` read seed (generalizes into layer 1), the `applyDesign` enum path (kept as a fast restyle that never touches the filesystem).

## Layer 1 — public commerce API + client (the keystone)

~70% exists as internal functions; the net-new work is a thin public HTTP layer + key auth + token identity. **Server-authoritative pricing is fully preserved** — the client only ever sends `itemId / variationId / qty / modifiers / mode / tip / coords`; the server re-reads prices, taxes, fees, and delivery and recomputes every total.

- **Keys** — clone `payments.api_keys` → `commerce.api_keys`, reuse `authenticateMerchantApiKey` verbatim. Two classes: **publishable** `krc_pub_…` (browser-safe; catalog read + search + cart + checkout for the bound shop's org only) and **secret** `krc_sk_…` (server-only; adds order list + webhooks). Org is always derived from the key, never the body.
- **Identity** — the cookie anon-session is replaced by a server-minted opaque `cartToken` (bound to a `commerce.customers` row) returned by `createCart` and replayed on every call.
- **Endpoints** — `GET /api/commerce/v1/catalog`, `GET …/items/{id}`, `POST …/search`, `POST …/carts`, `GET/PUT …/carts/{token}[/lines]`, `POST …/carts/{token}/pricing`, `POST …/carts/{token}/checkout`, `GET …/orders/{id}`, `GET …/orders` (secret only).
- **Client** — `packages/commerce` (`@krafta/commerce`): a dependency-free, fetch-based typed client (`createCommerceClient({ apiUrl, publishableKey })` → `getCatalog/getItem/search/createCart/getCart/setLines/getCartPricing/checkout/getOrder`). Shipped into generated/ejected shops.

## Layer 2 — starter template (`krafta-shop/`)

Minimal, real, runnable Next 16 + Tailwind v4 + shadcn + `@krafta/commerce`. ~6 pages (landing, menu, menu/[category], product/[slug], cart, checkout, order/[id]), ~8 editable blocks. `theme.css` is the **one-file reskin surface** (oklch tokens). Money renders only through `<Price cents>`; totals come only from the engine breakdown. The agent owns 100% of structure + skin as portable code; it must keep the `<CommerceProvider>` wrap and the `components/commerce/*` call contracts.

## Layer 3 — codegen agent

AI SDK v6 `streamText`/tool loop (OpenAI-direct, reuses `buildStudioAgent` + `STUDIO_AGENT_MODEL`). Lovable/v0-style tools: `writeFile` (full file), `editFile` (search/replace + `...` ellipsis — the cheap default), `readFile`/`readFiles`, `listFiles`, `moveFile`, `deleteFile`, `addDependency` (allowlisted, install-before-import), `runCommand`, `startDevServer` (once), `readLogs`. Keep `getCatalogOverview`/`searchCatalog` for grounding and `applyDesign` for pure restyles. **Loop:** deps-first → write/edit → build (`tsc --noEmit` + eslint + build) → on red, feed source-mapped errors back and auto-fix (cap ~3 via `stepCountIs`) → dev server hot-reloads the preview. On-rails: locked deps + fixed skeleton + the SDK-only commerce rule + lint/typecheck/build gates.

## Layer 4 — sandbox runtime

Vercel Sandbox (Firecracker microVMs, `node24`, iad1). Flow: `Sandbox.create({ ports:[3000], resources:{vcpus:2}, timeout: ms('30m') })` → `writeFiles` (Buffers) → `runCommand('npm install')` → `runCommand('npm run dev', { detached:true })` (dev script binds `-H 0.0.0.0 -p 3000`) → `sandbox.domain(3000)` = public preview URL → iframe. Persistent-by-default snapshots → `Sandbox.getOrCreate({ name })` resumes a draft. **Cost is dominated by idle memory** while `next dev` sits open ($0.0212/GB-hr full wall-clock) — so **stop on idle** and `extendTimeout` while active. Latency from UZ ~150–200ms (fine for a preview iframe). Auth: `VERCEL_OIDC_TOKEN` auto-injected when our backend runs on Vercel; off-Vercel needs `VERCEL_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID`. Put Studio sandbox usage on a dedicated Vercel project for clean cost attribution + spend caps. (Alternatives — e2b / Daytona / WebContainers — are viable but Vercel Sandbox is the native fit since we're already on Vercel and it integrates with the deploy step.)

## Sequencing

1. `@krafta/commerce` client contract (types + fetch client). ← **building now**
2. Public API: `commerce.api_keys` migration + `authenticateCommerceApiKey` + the read endpoints (catalog/items/search), then cart + checkout with `cartToken` identity.
3. Dashboard: issue/rotate/revoke commerce keys per shop.
4. The `krafta-shop/` starter template, compiling against the client.
5. Codegen agent: file tools + the sandbox + build/fix loop, behind a flag on one example shop.
6. Live preview beside the chat; deploy-to-subdomain.

## What's needed from the founder (only at layer 4/5)

- A **Vercel access token** (or run Studio's backend on Vercel for zero-config OIDC) + a **dedicated Vercel project** for sandbox cost attribution. Not needed until the sandbox-wiring slice.
- Approval to add the `commerce.api_keys` migration to the dev Supabase branch.
- Pro Vercel plan is the realistic floor (24h sessions, high concurrency) once multi-merchant.
