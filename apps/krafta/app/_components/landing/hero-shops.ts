/**
 * hero-shops.ts — the three demo shops behind the hero's vertical switcher.
 * Kept in its own module (not exported from a component file) so react-refresh /
 * fast-refresh stays happy: component files should export only components.
 *
 * Each `slug` is a published catalog on the storefront route (`/[slug]`).
 * `shavi` = a real merchant's cafe (not a Krafta-authored demo — genuinely
 * live on prod with real items/photos, so it doesn't depend on demo-seed
 * data existing in every environment). `beshqozon` = restaurant demo,
 * `vintage-shop` = retail demo.
 */

export const HERO_SHOPS = [
  { key: "cafe", label: "Кафе", slug: "shavi" },
  { key: "restaurant", label: "Ресторан", slug: "beshqozon" },
  { key: "retail", label: "Магазин", slug: "vintage-shop" },
] as const;
