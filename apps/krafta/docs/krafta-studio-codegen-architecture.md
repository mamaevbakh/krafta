# Krafta Studio — Codegen Builder Architecture

**Status:** Plan of record, 2026-06-29 · grounded in Vercel Sandbox docs + the existing engine. Decision: full codegen sandbox (literal v0/Bolt), eject-yes. Supersedes the enum-`applyDesign` approach for structure (that stays as a fast restyle path).

## The shape

A merchant describes a shop; an AI **coding agent** generates and iterates on a **real Next.js project** running in a **Vercel Sandbox**, with a live preview, and deploys it to `merchant-name.krafta.org`. The agent writes real, ejectable code (shadcn-first) — but every commerce operation routes through `@krafta/commerce`, our key-gated client to the engine. **The engine is the rail:** the agent can render commerce data and restyle 100%, but can never compute money, build its own cart, or touch the DB. That single invariant keeps every total honest on a structure we've never seen.

## Critical path (bottom-up — each layer needs the one below)

1. **Public commerce API + `@krafta/commerce` client** — the foundation. A sandboxed/ejected shop has no cookie session and can't hold the service-role key, so it calls a public, key-gated HTTP API.
2. **The shop starter template** — the real Next 16 + shadcn project the agent scaffolds from and freely restyles.
3. **The codegen agent** — built on **eve** (Vercel's agent framework): file tools + edit→run→fix loop come prebuilt; we add the commerce tools.
4. **Sandbox runtime + live preview** — **eve wraps Vercel Sandbox** (lifecycle, durable resume, preview URL); iframe beside the chat.
5. **Deploy to subdomain** — Vercel for Platforms → `merchant-name.krafta.org`.

What we've already built feeds straight in: the org-gated Studio agent + chat UI (layers 3/4 reuse it), the `lib/commerce-sdk` read seed (generalizes into layer 1), the `applyDesign` enum path (kept as a fast restyle that never touches the filesystem).

## Layer 1 — public commerce API + client (the keystone)

~70% exists as internal functions; the net-new work is a thin public HTTP layer + key auth + token identity. **Server-authoritative pricing is fully preserved** — the client only ever sends `itemId / variationId / qty / modifiers / mode / tip / coords`; the server re-reads prices, taxes, fees, and delivery and recomputes every total.

- **Keys** — clone `payments.api_keys` → `commerce.api_keys`, reuse `authenticateMerchantApiKey` verbatim. Two classes: **publishable** `krc_pub_…` (browser-safe; catalog read + search + cart + checkout for the bound shop's org only) and **secret** `krc_sk_…` (server-only; adds order list + webhooks). Org is always derived from the key, never the body.
- **Identity** — the cookie anon-session is replaced by a server-minted opaque `cartToken` (bound to a `commerce.customers` row) returned by `createCart` and replayed on every call.
- **Endpoints** — `GET /api/commerce/v1/catalog`, `GET …/items/{id}`, `POST …/search`, `POST …/carts`, `GET/PUT …/carts/{token}[/lines]`, `POST …/carts/{token}/pricing`, `POST …/carts/{token}/checkout`, `GET …/orders/{id}`, `GET …/orders` (secret only).
- **Client** — `packages/commerce` (`@krafta/commerce`): a dependency-free, fetch-based typed client (`createCommerceClient({ apiUrl, publishableKey })` → `getCatalog/getItem/search/createCart/getCart/setLines/getCartPricing/checkout/getOrder`). Shipped into generated/ejected shops.

## Layer 1.5 — cart + checkout write path (design locked, build pending)

The read API is live; the **write** path (cart mutations + checkout) is the security-critical money slice. Today's write path runs `commerce.cart_apply_writes` (`SECURITY INVOKER`) + `placeOrder`, scoped by RLS to a per-shopper **anonymous Supabase session** (`signInAnonymously` cookie → `auth.uid()`). A headless key has no cookie session, so we bridge identity. **Decision: approach A — anon-user per `cartToken`, preserve RLS** (the DB stays the isolation boundary; reuses all business logic). Rejected B (service-role + app-level scoping) because it moves isolation into hand-written filters — one missing `WHERE customer_id` is a cross-tenant breach.

Design:
- **`commerce.cart_sessions`** (new table, service-role only): `token_hash` (unique) → `customer_id`, `org_id`, `catalog_id`, `auth_user_id`, `refresh_token` (the anon user's), `created_at`, `expires_at`, `last_used_at`. The opaque `cartToken` is random; only its hash is stored.
- **`createCart`** (`POST /carts`): server-side `signInAnonymously` (fresh anon-key client) → anon user + session; `ensureCartIdentity`-mint the `commerce.customers` row for the key's org; store the session under a new `cartToken`; return `{ cartToken, cart }`.
- **`clientForCartToken(cartToken)`**: resolve the session → build a Supabase client authed AS that anon user (Authorization: Bearer access_token; refresh via the stored refresh_token when stale). RLS then scopes exactly as the storefront.
- **Refactor (low-risk, mechanical):** `getOrCreateDraftOrder` / `getCartSummary` / `upsertCartLines` / `placeOrder` take an OPTIONAL injected `supabase` client, defaulting to `createClient()` — the live storefront path stays byte-identical; headless passes the cart-token client.
- **Endpoints:** `POST /carts` (create), `GET /carts/{token}` (getCartSummary), `PUT /carts/{token}/lines` (upsertCartLines — server re-prices, client never sends price), `POST /carts/{token}/pricing` (computePricing preview), `POST /carts/{token}/checkout` (placeOrder — re-validates price-drift / zone / min-order / tip-cap; returns typed error codes). `GET /orders/{id}` reads the placed order, cartToken-scoped.
- **Invariants preserved:** server re-reads every price (`upsertCartLines`), recomputes all totals/taxes/fees server-side (`computePricing` at checkout), runs price-drift + delivery-zone + min-order + tip-cap re-validation (`placeOrder`). No price/total/fee/tax ever accepted from the body. Cash/COD only (matches v1).
- **Build as its own focused effort** with live end-to-end verification (createCart → setLines → re-priced cart → placeOrder against a real shop). Not to be rushed.

## Layer 2 — starter template (`krafta-shop/`)

Minimal, real, runnable Next 16 + Tailwind v4 + shadcn + `@krafta/commerce`. ~6 pages (landing, menu, menu/[category], product/[slug], cart, checkout, order/[id]), ~8 editable blocks. `theme.css` is the **one-file reskin surface** (oklch tokens). Money renders only through `<Price cents>`; totals come only from the engine breakdown. The agent owns 100% of structure + skin as portable code; it must keep the `<CommerceProvider>` wrap and the `components/commerce/*` call contracts.

## Layers 3 + 4 — codegen agent + sandbox = **eve** (adopted 2026-06-29)

**Decision:** build the codegen agent on **eve** (Vercel's new "framework for building agents" — https://vercel.com/eve), not a hand-rolled AI SDK loop. eve IS layers 3+4 prebuilt: an agent is a directory (`instructions.md` + `tools/*.ts` + `sandbox/` + `subagents/` + `schedules/`) that wraps **Vercel Sandbox** (isolated VM + file tools out of the box), **Vercel Workflows** (durable execution — checkpointed steps, park-between-messages, resume), **human-in-the-loop approval gates**, subagents, and evals. This removes the most novel infra we'd otherwise build by hand.

- **Model: OpenAI DIRECT, no AI Gateway.** eve accepts a provider-authored `LanguageModel`, so we pass `model: openai("gpt-5.4")` from `@ai-sdk/openai` with our own `OPENAI_API_KEY` — NOT the gateway `"openai/…"` string. Direct OpenAI billing, no Vercel AI Gateway hop; the same wiring the storefront assistant + menu-extraction + Studio agent already use. (Confirmed in eve docs: a gateway-id string routes through AI Gateway; a `LanguageModel` instance calls the provider directly.) `reasoning` effort is still available provider-agnostically.
- **Tools (`tools/*.ts`):** the file CRUD comes free from eve's sandbox; we add the COMMERCE rail as eve tools that wrap `@krafta/commerce` (so the agent imports/uses commerce but can never recompute money), plus `applyDesign` (kept as a fast no-codegen restyle) and `getCatalogOverview`/`searchCatalog` for grounding.
- **Skeleton + loop:** the sandbox is pre-scaffolded from the `krafta-shop/` starter (layer 2). The agent edits files → build (`tsc --noEmit` + eslint) → on red, eve's durable loop feeds errors back + auto-fixes. On-rails = locked deps + fixed skeleton + the SDK-only commerce rule + lint/typecheck gates.
- **Sandbox config:** `sandbox/sandbox.ts` → `vercelSandboxBackend({ runtime: "node24" })`. eve manages the Vercel Sandbox lifecycle (create / writeFiles / install / dev / preview URL / persistent resume / stop-on-idle) so we don't. Cost is still dominated by idle `next dev` memory — eve's park/stop semantics handle this.
- **Integration:** the codegen agent is its own eve agent; the Studio dashboard surfaces it via eve's web channel / API (our existing ai-elements chat can drive it, or we use eve's channel). The lightweight read+`applyDesign` Studio agent we already shipped can stay on AI SDK or migrate to eve later.
- **Risk (accepted):** eve is brand-new (early framework — API churn / bugs). Mitigants: first-party Vercel, we're already all-in on Vercel, and the commerce layer (1+2) is framework-agnostic, so we can drop to raw `@vercel/sandbox` without touching the engine if eve disappoints.

Auth/cost for the sandbox is handled by eve/Vercel: `VERCEL_OIDC_TOKEN` auto-injected when our backend runs on Vercel (off-Vercel needs `VERCEL_TOKEN` + team/project ids). Put Studio's eve agent on a **dedicated Vercel project** for clean cost attribution + spend caps. Latency from UZ ~150–200ms (fine for a preview iframe).

## Sequencing

1. `@krafta/commerce` client contract (types + fetch client). ← **building now**
2. Public API: `commerce.api_keys` migration + `authenticateCommerceApiKey` + the read endpoints (catalog/items/search), then cart + checkout with `cartToken` identity.
3. Dashboard: issue/rotate/revoke commerce keys per shop.
4. The `krafta-shop/` starter template, compiling against the client.
5. The **eve** codegen agent: `npx eve init`, wrap `@krafta/commerce` as tools, pre-scaffold the sandbox from the starter, build/fix loop — behind a flag on one example shop.
6. Live preview beside the chat (eve sandbox URL); deploy-to-subdomain.

## What's needed from the founder

- Approval to add the `commerce.api_keys` migration to the dev Supabase branch (layer 1, next slice).
- At the eve/agent layer: a **dedicated Vercel project** for the Studio eve agent (clean cost attribution + spend caps); when Studio's backend runs on Vercel the sandbox auth (OIDC) is zero-config. **Pro Vercel plan** is the realistic floor once multi-merchant (24h sessions, high concurrency). The eve agent's model is **OpenAI direct** (`model: openai("gpt-5.4")` via `@ai-sdk/openai` + `OPENAI_API_KEY`) — **no AI Gateway**, per the founder's requirement.
