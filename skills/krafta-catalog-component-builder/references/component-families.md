# Component Families

Use this file to pick the correct folder, props type, and behavior contract for each Builder-selectable family.

## Header Variants

- Variant key type: `HeaderVariant` in `apps/krafta/lib/catalogs/settings/layout.ts`
- Registry: `headerRegistry` in `apps/krafta/lib/catalogs/layout-registry.tsx`
- Folder: `apps/krafta/components/catalogs/headers`
- Props type: `HeaderProps` from `apps/krafta/lib/catalogs/layout-registry.tsx`
- Required output:
- Show catalog identity using `catalogName`.
- Support optional `description`, `logoUrl`, and `tags`.

Current tokens:
- `header-basic` -> `header-basic.tsx`
- `header-center` -> `header-center.tsx`
- `header-hero` -> `header-hero.tsx`

## Section Variants

- Variant key type: `SectionVariant` in `apps/krafta/lib/catalogs/settings/layout.ts`
- Registry: `sectionRegistry` in `apps/krafta/lib/catalogs/layout-registry.tsx`
- Folder: `apps/krafta/components/catalogs/sections`
- Props type: `SectionProps`
- Required output:
- Render a `<section>` with id `category-${category.slug ?? category.id}`.
- Render a category heading and `children`.

Current tokens:
- `section-basic` -> `section-basic.tsx`
- `section-separated` -> `section-separated.tsx`
- `section-pill-tabs` -> `section-pill-tabs.tsx`

## Item Card Variants

- Variant key type: `ItemCardVariant` in `apps/krafta/lib/catalogs/settings/layout.ts`
- Registry: `itemCardRegistry` in `apps/krafta/lib/catalogs/layout-registry.tsx`
- Folder: `apps/krafta/components/catalogs/cards`
- Props type: `ItemCardProps`
- Required output:
- Accept `item` and optional `imageUrl`.
- Respect `imageAspectRatio` when image ratio matters.
- Use `formatPriceCents(item.price_cents, currencySettings)` when showing prices.

Current tokens:
- `card-big-photo` -> `card-photo-big.tsx`
- `card-minimal` -> `card-minimal.tsx`
- `card-photo-row` -> `card-photo-row.tsx`
- `card-default` -> `card-default.tsx`
- `card-glass-blur` -> `card-glass-blur.tsx`

## Item Detail Variants

- Variant key type: `ItemDetailVariant` in `apps/krafta/lib/catalogs/settings/layout.ts`
- Registry: `itemDetailRegistry` in `apps/krafta/lib/catalogs/layout-registry.tsx`
- Folder: `apps/krafta/components/catalogs/items`
- Props type: `ItemDetailProps`
- Required output:
- Work in drawer/fullscreen context.
- Use `itemAspectRatio` for image media when applicable.
- Support `onClose` for fullscreen behavior.

Current tokens:
- `item-sheet` -> `item-detail-sheet-view.tsx`
- `item-fullscreen` -> `item-detail-fullscreen-view.tsx`

## Category Nav Variants

- Variant key type: `CategoryNavVariant` in `apps/krafta/lib/catalogs/settings/layout.ts`
- Registry: `categoryNavRegistry` in `apps/krafta/lib/catalogs/layout-registry.tsx`
- Folder: `apps/krafta/components/catalogs/navbars`
- Props type: `CategoryNavProps`
- Required output:
- Provide category switching UI based on `categories`.
- Respect `activeCategoryId` and `activeCategorySlug`.
- Keep URL in sync using `baseHref`.
- Return `null` when no categories.

Current tokens:
- `nav-none` -> `null`
- `nav-tabs` -> `category-nav-tabs.tsx`
- `nav-tabs-motion` -> `category-nav-tabs-motion.tsx`
- `nav-tabs-dashboard` -> `category-nav-tabs-dashboard.tsx`

