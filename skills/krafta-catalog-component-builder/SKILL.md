---
name: krafta-catalog-component-builder
description: Build and wire new catalog layout variants in the Krafta app. Use when requests involve creating or changing Builder-selectable components (headers, sections, item cards, item detail views, category nav), updating layout registry/settings unions, and ensuring the dashboard Builder + preview routes recognize the new variant.
---

# Krafta Catalog Component Builder

Implement new Builder variants by following the existing catalog layout contract instead of inventing a new wiring path.

## Workflow

1. Identify the variant family before editing:
- `headerVariant`
- `sectionVariant`
- `itemCardVariant`
- `itemDetailVariant`
- `categoryNavVariant`

2. Read `references/component-families.md` and use the matching props contract for that family.

3. Add or update the component file in the correct folder under `apps/krafta/components/catalogs/...`.

4. Wire the variant token through the required touchpoints in `references/integration-touchpoints.md`.

5. Verify integration:
- Confirm the variant appears in dashboard Builder options.
- Confirm preview accepts the variant through query params.
- Confirm no type errors from exhaustive `Record<Variant, ...>` maps.

## Editing Rules

- Keep variant tokens hyphenated (example: `card-editorial-stack`).
- Reuse shared helpers already used by variants:
- `formatPriceCents` for price UI.
- `AspectRatio` when image ratio needs to track Builder controls.
- Keep section IDs in the form `category-${category.slug ?? category.id}` so nav scrolling continues to work.
- Use `"use client"` only when hooks/browser APIs are required.
- Do not add a new variant family unless explicitly requested; default to extending an existing family.

## Validation

- Run `pnpm --filter krafta lint` after wiring.
- If the app is running, open `/dashboard/[orgSlug]/[catalogSlug]/builder` and verify the new option renders in the preview frame.

