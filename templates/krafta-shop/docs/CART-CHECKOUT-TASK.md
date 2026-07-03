# Task: Ship full cart + checkout in the coded shop template

**Delegation brief — self-contained. A fresh session can execute this with no prior context.**

## Goal

Make **`templates/krafta-shop`** (the starter template that Krafta Studio's AI reskins into "coded shops") ship with a real, working **add-to-cart → cart → checkout → order** experience, wired entirely to the headless **`@krafta/commerce`** client, at UX parity with Krafta's enum-driven storefront. Today the template only *displays* the catalog; the "Add" button is decorative. After this task, every AI-built coded shop has working commerce out of the box.

## Acceptance criteria

A visitor to a coded shop (rendered from this template against a real published catalog with order modes enabled) can:

1. Browse products; open an item and **select a variation + modifiers + quantity**.
2. **Add to cart**; see a cart count update.
3. Open a **cart** with line items (name, variation, modifier summary, line total), adjust **quantity (+/−)** and **remove** lines, and see a **server-computed subtotal**.
4. Go to **checkout**, pick an **order mode** (pickup / dine-in / delivery — only those the catalog enables), fill the **mode-specific fields**, add a tip, and see **server-authoritative pricing** (taxes / fees / delivery / tip / total).
5. **Place a Cash/COD order** and see an **order confirmation** (order id, state, lines, totals).
6. **Cart persists across reloads** (cart token in `localStorage`, restored via `getCart`).

Non-negotiables:
- **All money comes from the server** — `getCart().subtotalCents`, `getCartPricing()`, the order. NEVER sum or compute a price/total in client code.
- **Everything goes through `@krafta/commerce`** (browser `fetch` with the publishable key + cart token). The template is a standalone Next app: **no server actions, no Supabase, no other backend.**
- **Themeable + composable.** The AI reskins this template per shop, so the cart/checkout must be clean components driven by semantic Tailwind tokens (`bg-background`, `text-foreground`, …) — no hardcoded colors, no one-giant-file.

## Current state (verified 2026-06-30 by three mapping passes)

### Headless layer — COMPLETE, just unused by the template
`packages/commerce/src/client.ts` exposes (all backed by fully-implemented `apps/krafta/app/api/commerce/v1/*` routes, RLS-scoped, server-authoritative, with cross-shop rejection):

| Method | Endpoint | Notes |
|---|---|---|
| `getCatalog({locale?})` | `GET /catalog` | categories → items → variations → modifiers + taxes |
| `getItem(idOrSlug, {locale?})` | `GET /items/{id}` | single item w/ variations + modifierLists |
| `search(query, {limit?,locale?})` | `POST /search` | |
| `createCart()` | `POST /carts` | returns `{ cartToken, … }` — **persist the token client-side** |
| `getCart(cartToken)` | `GET /carts/{token}` | current cart state |
| `setLines(cartToken, CartLineInput[])` | `PUT /carts/{token}/lines` | **batch absolute-qty upsert**; `qty:0` removes a line; server re-prices |
| `getCartPricing(cartToken, {mode?,tipCents?,deliveryCoords?})` | `POST /carts/{token}/pricing` | server-authoritative preview (taxes/fees/delivery/tip) |
| `checkout(cartToken, {mode, fields, tipCents?})` | `POST /carts/{token}/checkout` | places order; throws `CommerceError` w/ `CheckoutErrorCode` |
| `getOrder(orderId, cartToken)` | `GET /orders/{id}?cartToken=…` | read placed order |

Auth: client config is `{ apiUrl, publishableKey, catalogId? }`; every request sends `Authorization: Bearer {publishableKey}`. Cart calls additionally resolve the opaque `cartToken`.

Key types (`packages/commerce/src/types.ts`):
- `CartLineInput` = `{ itemId, variationId, qty, modifiers?: ModifierSelection[] }`
- `ModifierSelection` = `{ modifierListId, modifierIds?: string[] }` (list) or `{ modifierListId, text?: string }` (text)
- `CartLine` (server-computed) = `{ lineId, itemId, variationId, name, qty, unitPriceCents, lineTotalCents, modifiers[] }`
- `Cart` = `{ cartToken, lines: CartLine[], subtotalCents, currency }`
- `PricingInput` = `{ mode?, tipCents?, deliveryCoords?: {lat,lng} }`; `PricingBreakdown` = subtotal + fee lines + delivery + tip + total
- `CheckoutInput` = `{ mode: OrderMode, fields: CheckoutFields, tipCents? }`
- `CheckoutFields` = `{ name?, phone?, table?, address?, apartment?, coords?, scheduledFor?, note? }` (which apply depends on mode)
- `CheckoutErrorCode` = `"price_changed" | "out_of_zone" | "below_min_order" | "phone_invalid" | "tip_too_high" | "cart_empty"`
- `Order` = `{ id, state, mode, lines, pricing, paymentStatus, createdAt }`

The full lifecycle works end-to-end **today**; this task does NOT require new endpoints. (Optional niceties that are deliberately OUT of scope: per-line PATCH/DELETE — use batch `setLines` with `qty:0`; cart-clear endpoint — `setLines([])`; order-history list; webhooks; card payments. v1 is Cash/COD.)

### The template today — read-only (`templates/krafta-shop`)
- ✅ Wired: `lib/commerce.ts` (creates the client), `app/page.tsx` + `app/menu/page.tsx` (`getCatalog`), `components/blocks/menu-grid.tsx`, `components/blocks/product-card.tsx` + `components/commerce/price.tsx` (display + `<Price cents currency/>`).
- ❌ Missing: add-to-cart wiring (the `<Button>Add</Button>` at `components/blocks/product-card.tsx:27-32` has no handler — there's a literal TODO comment there), cart state/provider/hook, cart UI (drawer/page), quantity steppers, variation/modifier selection UI, checkout form, order confirmation. `package.json` has `@krafta/commerce` but **no state lib and no `framer-motion`** (add deps as needed — install before import).

### The reference UX to mirror — enumed storefront (`apps/krafta`, READ for UX, do NOT import)
This is the gold-standard cart to match; it uses **internal server actions**, so port the *behavior*, not the code, onto the headless client:
- Cart state + optimistic/debounced batch: `apps/krafta/components/catalogs/cart/cart-provider.tsx` (the `useCart` hook, `scheduleSetLine` debounce → batch flush → `upsertCartLinesAction`). The headless analogue of `upsertCartLinesAction` is `setLines`.
- Add buttons + card steppers: `components/catalogs/cart/cart-actions.tsx`
- Cart drawer w/ 3 steps (cart → checkout → placed): `components/catalogs/cart/cart-drawer.tsx`
- Checkout form (mode picker, per-mode fields, address/map pin, tip, phone validation): `components/catalogs/cart/checkout-step.tsx`
- Pricing display: `components/catalogs/cart/pricing-breakdown.tsx` (note: enumed computes taxes client-side from local rows; the **template should instead call `getCartPricing` for the authoritative total**)
- Confirmation: `components/catalogs/cart/placed-step.tsx`
- Item variation/modifier selection: `components/catalogs/items/item-detail-controller.tsx`

## Build plan (phased — land + verify each before the next)

**Phase 0 — Cart provider + token.** A client `CartProvider` (React context + `useCart`) that: lazily `createCart()` on first add and persists `cartToken` to `localStorage`; on mount, if a token exists, `getCart()` to restore (gracefully drop an expired/invalid token and start fresh); holds `{ cart, addLine, setQty, removeLine, isLoading }`. All mutations go through `setLines` (absolute-qty batch) and then store the returned server `Cart`. Wrap the app in `app/layout.tsx`.

**Phase 1 — Add to cart (simple items).** Wire `product-card.tsx`'s Add button → `addLine({ itemId, variationId: defaultVariationId, qty: 1 })`. Add a header cart button with a line-count badge. Optimistic bump is nice-to-have; correctness comes from the server `Cart` you store after each `setLines`.

**Phase 2 — Variations + modifiers.** An item detail view/sheet (route `app/item/[idOrSlug]` or a sheet) that renders `item.variations` + `item.modifierLists` (from `getItem`/catalog), enforces `minSelected/maxSelected` + text/`maxLength`, computes the displayed unit price from the selected variation (display only — server still authoritative), and calls `addLine` with `variationId` + `ModifierSelection[]`. Route customizable items here instead of one-tap add.

**Phase 3 — Cart UI.** A cart drawer/page listing `cart.lines` (name, variation, modifier summary, `<Price cents={lineTotalCents}/>`), a quantity stepper (+/− → `setLines` with new qty; trash/`qty:0` to remove), and the server `subtotalCents`. Re-render from the server `Cart` returned by every mutation.

**Phase 4 — Checkout.** A checkout form gated to `catalog.orderModes`: mode picker (pickup/dine-in/delivery) → mode-specific fields (pickup: name/phone/schedule/note; delivery: name+phone required, address + `coords` map pin, schedule, note; dine-in: table) + tip. Call `getCartPricing({mode, tipCents, deliveryCoords})` to show taxes/fees/delivery/tip/**total**, then `checkout({mode, fields, tipCents})`. Map each `CheckoutErrorCode` to a friendly message and re-sync the cart on `price_changed`.

**Phase 5 — Order confirmation.** On success, `getOrder(orderId, cartToken)` → confirmation (order id, state, lines, final pricing); clear the cart + `localStorage` token; offer "order more" → catalog. (Delivery map-pin can start as a lat/lng/address input; a full map picker is a follow-up — keep the seam.)

## Invariants & gotchas (read before coding)

- **`*_cents` = major × 100 for EVERY currency (UZS included).** Render only via `<Price cents currency/>`; never divide/sum yourself.
- **Server-authoritative money, always.** Subtotal from `getCart`, totals from `getCartPricing`/the order. The server re-reads every price/modifier and rejects forged amounts — client price math is display-only.
- **`setLines` is absolute-quantity batch upsert**, keyed by the (item, variation, modifiers) tuple. To change one line you resend that line's target qty; `qty:0` removes it. Track enough line state to do this (the server `Cart` gives you `lineId` + the inputs).
- **Cart token is a bearer secret** the shop holds in `localStorage`; it's how the cart + order are scoped. Handle "no token / expired token" by minting a fresh cart.
- **The engine is the only commerce path.** Do not add a dependency that does commerce/auth/data; do not call any other backend. Visual/interactive deps (e.g. `framer-motion`) are fine — install before import.
- **Order modes vary per shop.** Read `catalog.orderModes`; only show enabled modes. A shop with none enabled should show the cart but disable checkout with a clear message.
- **Keep it reskinnable.** Semantic tokens only; small composable components under `components/commerce/*` and `components/blocks/*`; split routes/components (no giant files) so the Studio AI can restyle freely.

## How to verify

Run the template against a real published catalog (e.g. the dev "Monolic" shop: catalog `iav2phmb`, publishable key in `catalogs.studio_publishable_key`, order modes active) by setting `NEXT_PUBLIC_KRAFTA_API_URL` + `NEXT_PUBLIC_KRAFTA_PUBLISHABLE_KEY` in `.env.local`, then walk the full flow in a browser: add an item with a variation + modifier → cart → adjust qty → checkout (pickup) → place order → see confirmation; reload mid-cart to confirm persistence. `npx tsc --noEmit` clean. Do NOT run `npm run build` to verify (slow/disk).

## Out of scope (do not build here)
Per-line PATCH/DELETE endpoints, cart-clear/abandon endpoint, order-history list, webhooks, card/online payments, a full map-picker — all tracked separately. Don't touch the commerce engine or the `@krafta/commerce` API surface unless a Phase genuinely can't be done without it (it can).
