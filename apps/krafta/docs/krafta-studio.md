# Krafta Studio

**Status:** Locked 2026-06-29 · **Owner:** Bakh (founder) · **Build lead:** CTO

## What it is

Krafta Studio is an AI that builds real online shops. A merchant describes the shop they want; the AI builds a working storefront — their design, their structure, their domain — powered by Krafta's commerce engine (cart, prices, checkout, payments, orders, delivery).

**Like v0 or Lovable, but for commerce.**

## The merchant journey

1. **Describe it** — "a dark, minimal coffee shop." Or start from menu photos.
2. **The AI builds it** — a real, working storefront appears, fully custom.
3. **Tweak it live** — "bestsellers first," "bigger photos" — watch it change as you talk.
4. **Publish** — live at `yourname.krafta.org`, taking real orders.

## Full creative freedom — structure *and* skin

The merchant isn't restyling a fixed template. They get full freedom of **structure and look**: a landing page that leads into the shop, a multi-page site, a separate page per product — whatever they want, the AI builds it.

**The one invariant, no matter the structure:** anything commerce — cart, prices, totals, checkout, orders — always runs through Krafta's engine. The merchant owns the look and the layout; Krafta owns the machine. That is what keeps every order correct and every total honest, even on a structure we've never seen.

## Skin: shadcn first

v1 builds the look with shadcn — the AI is excellent at it from day one, with zero component-library investment from us. Krafta's own branded component library is a later upgrade, not a prerequisite.

## Packaging

| Tier | Price | Unlocks |
|---|---|---|
| **Starter** | Free | Build with the AI, publish on `yourname.krafta.org`, full commerce engine |
| **Pro** | ~$20/mo | Your own custom domain, Krafta marks removed, more AI building |
| **Studio+** | Later, premium | Export and own the code, take it fully in-house |

## v1 scope

A hosted AI shop-builder inside Krafta: **describe → build → tweak live → publish to a `krafta.org` subdomain**, with full structural and visual freedom, a shadcn skin, powered by the existing commerce engine. Starting market: **single-location food/retail, cash/COD** (what already works today).

**Deliberately later:** custom domains (Pro) · export/eject (Studio+) · Krafta's own component kit · card payment at checkout (Krafta Pay).

## Build order

1. **Free the engine** — turn today's shop behavior into a reusable commerce layer the AI wires up correctly every time. *(foundation; invisible to merchants)*
2. **The AI builder** — the describe → build → tweak-live → publish loop, hosted in Krafta, deploying to subdomains.
3. **One perfect example shop**, end to end — then open a private beta.

## Why it's defensible

The design and structure are the merchant's, and portable. The commerce engine, the data, and the AI that assembles it are Krafta's. We compete on the engine and the agent, not on locking the design in — an un-walled garden developers and merchants actually want, with the stickiness where it belongs: the backend.

---

## Build log — v0 (2026-06-29, overnight)

First slice shipped on branch `feat/krafta-studio`: the **Krafta Studio (Beta)** tab inside the Studio, opening a working, shop-aware AI agent. This is the entry point of the product; it does not yet write changes (advice + planning), and the commerce SDK underneath it is seeded.

**What's in:**
- **The tab.** A new `assistant` focus in the Studio switcher (`components/dashboard/catalog-builder-panel.tsx`), labelled "Krafta Studio" with a Beta badge. Selecting it replaces the design grid with a full-width agent panel; all existing design tabs (Structure/Cards/Brand/Pricing/Cart) are untouched.
- **The agent UI.** `components/dashboard/studio-agent-panel.tsx` — a full chat surface built on the repo's `ai-elements` (Conversation, Message, PromptInput, Suggestion, Loader), AI SDK v6 `useChat`. Empty state with suggested prompts, streaming, tool-activity chips, DESIGN.md-compliant (Geist, oklch tokens, Beta-badge pattern), verified in light + dark.
- **The agent backend.** `lib/agents/studio-agent.ts` (`buildStudioAgent`) + `app/api/studio-agent/route.ts`. OpenAI-direct (env `STUDIO_AGENT_MODEL`, default `gpt-5.4`, reuses `OPENAI_API_KEY`), mirroring the storefront assistant. Gated by **org membership** (`organization_members` owner/admin check against the cookie session — same pattern as the logo/banner upload routes); the agent's tools are bound to the verified catalog, never trusted from the body.
- **Read-only tools.** `lib/tools/studio-catalog-overview.ts` (live shop snapshot) + reused `searchCatalog`. The agent grounds advice in the shop's real categories, item counts, currency, modes, and layout.
- **Commerce SDK seed ("free the engine", step 1).** `lib/commerce-sdk/` — `getCommerceAdminClient()` + `getCatalogOverview()`. The first reusable, framework-agnostic read facade; cart/checkout/order facades land here next, preserving the server-authoritative pricing path.

**Verified:** typecheck clean (one pre-existing unrelated QR-test error); panel renders in light + dark (screenshotted via a temporary isolated route, since the real tab is auth-gated); API returns 400/404 correctly with no 500s. The real builder route never SSR-renders the panel (it mounts only on the client tab click), so the `useChat`/Math.random prerender notice seen on the temp route does not apply.

### Update — first write tool (2026-06-29)

The agent can now **change the shop**, not just advise. New `applyDesign` **client tool** (`lib/tools/studio-design-tools.ts`): the agent sets the header style, section style, product-card family, grid columns, category nav, cart on/off, and price formatting. It's misuse-proof by construction — every field is enum/range-constrained to values the storefront already renders. The patch flows into the live builder state (`applyDesignPatch` in `catalog-builder-panel.tsx`) via the proven storefront client-tool pattern (resolved post-stream in `studio-agent-panel.tsx`), so the merchant sees it in **Open preview** and keeps it with the existing **Save changes** button — nothing persists silently. Deliberately excluded from the agent's reach: menu items/prices/photos, the currency code, brand colors, custom domain, publish.

**Next (in order):**
1. Final visual QA of the live tab + the apply→preview→Save loop inside the authenticated dashboard (needs a merchant session + `OPENAI_API_KEY`).
2. Show the live preview alongside the agent (so changes are visible without leaving the chat), and let the agent auto-save on confirm.
3. Wire **brand colors** end-to-end: persist `settings_branding` + a storefront theming engine, then add it to `applyDesign`.
4. Grow the commerce SDK from read-only into the cart/checkout facade.
5. The v0-style project scaffold + live preview + deploy-to-`merchant-name.krafta.org` loop (Vercel for Platforms + Sandbox).

