# krafta-shop (starter template)

The runnable scaffold the **Krafta Studio** codegen agent starts every shop from, then freely restyles. Next.js 16 + Tailwind v4 + the `@krafta/commerce` client.

## The deal

- **You own 100% of structure + skin** as plain, editable code — pages, blocks, `theme.css`.
- **Krafta owns the machine.** Every catalog read, cart op, and checkout flows through `@krafta/commerce` (`lib/commerce.ts`). Pricing stays server-authoritative; money renders only through `<Price>`, never summed in the shop.

## Restyle in one file

`theme.css` is the whole look — oklch colors, radius, fonts. Rewrite it to reskin the entire shop with zero risk to commerce.

## Run

```bash
cp .env.example .env.local   # set NEXT_PUBLIC_KRAFTA_API_URL + your krc_pub_ key
pnpm install
pnpm dev
```

The shop binds to one catalog via the publishable key; `commerce.getCatalog()` renders it.

## Layout

- `app/page.tsx` — landing → shop
- `app/menu/page.tsx` — the shop (categories → products)
- `components/blocks/*` — editable presentation (header, hero, product card, menu grid)
- `components/commerce/*` — the commerce-bound bits (`<Price>`, cart provider, item sheet, cart drawer, checkout, confirmation); restyle freely, keep the engine values
- `lib/commerce.ts` — the single `@krafta/commerce` client
- `lib/cart/*` — cart line signatures + `localStorage` persistence helpers

## Cart & checkout

Full **add-to-cart → cart → checkout → order** ships out of the box, wired entirely to `@krafta/commerce` from the browser (publishable key + a cart token persisted in `localStorage`). No server actions, no other backend.

- `CartProvider` (wrap your app, already done in `app/layout.tsx`) holds the cart and runs every mutation through `setLines`; `useCart()` exposes `addLine` / `setLineQty` / `removeLine` / `placeOrder`.
- The product card one-tap-adds simple items and opens the **item sheet** (variations + modifiers) for configurable ones.
- The **cart drawer** runs the cart list → checkout (mode picker gated to `catalog.orderModes`, mode-specific fields, tip) → order confirmation.

Everything money-related is server-authoritative: subtotals from `getCart`, the checkout total from `getCartPricing`, the receipt from the placed order. The shop only ever sends ids, quantities, selections, mode, and tip — never prices. Restyle any of it; just keep the cents coming from the engine and rendering through `<Price>`.
