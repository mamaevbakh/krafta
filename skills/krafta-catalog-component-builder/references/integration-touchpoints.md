# Integration Touchpoints

When adding a new variant token in an existing family, update files in this order.

## 1) Extend the Variant Union Type

File: `apps/krafta/lib/catalogs/settings/layout.ts`

- Add the new token to the correct union:
- `HeaderVariant`
- `SectionVariant`
- `ItemCardVariant`
- `ItemDetailVariant`
- `CategoryNavVariant`
- Update defaults only if the request explicitly asks to change the default theme.

## 2) Register the Component

File: `apps/krafta/lib/catalogs/layout-registry.tsx`

- Import the new component file.
- Add token -> component mapping into the correct registry object.
- Keep map keys exhaustive for the related union type.
- For item detail variants, register `{ Component, drawerClassName? }`.

## 3) Expose Friendly Label in Builder

File: `apps/krafta/app/dashboard/[orgSlug]/[catalogSlug]/builder/page.tsx`

- Add the token label in the matching `Record<Variant, string>`:
- `HEADER_LABELS`
- `SECTION_LABELS`
- `ITEM_CARD_LABELS`
- `ITEM_DETAIL_LABELS`
- `NAV_LABELS`

This is required because the label maps are exhaustive typed records.

## 4) Confirm Builder Panel and Preview Route Need No Extra Wiring

Files to verify:
- `apps/krafta/components/dashboard/catalog-builder-panel.tsx`
- `apps/krafta/app/preview/[...slug]/page.tsx`

Notes:
- Builder options are generated from registry-exported arrays (`headerVariants`, `itemCardVariants`, etc.), so new tokens flow automatically once steps 1-3 are done.
- Preview parsing validates incoming query values against those same variant arrays, so it also works automatically for same-family additions.

## 5) Validate Runtime Behavior

- Ensure rendered sections keep id `category-${category.slug ?? category.id}` (nav scrolling depends on it).
- Ensure card/detail components handle missing `imageUrl`.
- Ensure price output uses `formatPriceCents` when prices are shown.
- For interactive variants using hooks, browser APIs, or `framer-motion`, include `"use client"`.

## 6) Verify Persistence Path (No Code Change Usually Needed)

Persistence is already implemented:
- Save action: `apps/krafta/app/dashboard/[orgSlug]/[catalogSlug]/builder/actions.ts`
- DB fields: `settings_layout`, `settings_currency`
- Cache updates: `apps/krafta/lib/catalogs/revalidate.ts`

Additions to existing families should not require save-layer edits.

