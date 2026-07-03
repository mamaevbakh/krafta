# Krafta Shop (Next.js 16, App Router)

Before writing framework-specific code — routing, Server vs Client Component boundaries, `next/dynamic`, data fetching, caching — read the Next.js docs installed in this project, version-matched to exactly what's here:

```
node_modules/next/dist/docs/
```

Don't rely on training data for App Router specifics; it drifts fast, and getting it wrong doesn't just look bad — it crashes the page (e.g. `next/dynamic(..., { ssr: false })` used outside a Client Component 500s the whole route).

All commerce — catalog, cart, checkout, orders — flows through `lib/commerce.ts` and `components/commerce/*`. Never compute a price, write your own cart/checkout logic, or call another backend. See your system instructions for the full design and build rules; this file is the framework-correctness reminder.
