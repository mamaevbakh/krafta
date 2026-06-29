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
- `components/commerce/*` — the commerce-bound bits (e.g. `<Price>`); restyle freely, keep the engine values
- `lib/commerce.ts` — the single `@krafta/commerce` client

Cart + checkout components arrive with the commerce write API (Layer 1.5).
