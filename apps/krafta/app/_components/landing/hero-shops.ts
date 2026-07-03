/**
 * hero-shops.ts — the three demo shops behind the hero's vertical switcher.
 * Kept in its own module (not exported from a component file) so react-refresh /
 * fast-refresh stays happy: component files should export only components.
 *
 * Each `slug` is a published catalog on the storefront route (`/[slug]`).
 * `shavi` and `kuranti` are real merchants' shops (not Krafta-authored demos
 * — genuinely live on prod with real items/photos, so they don't depend on
 * demo-seed data existing in every environment). `vintage-shop` is the one
 * Krafta-authored demo, present in both dev and prod.
 */

export const HERO_SHOPS = [
  { key: "cafe", label: "Кафе", slug: "shavi" },
  { key: "restaurant", label: "Ресторан", slug: "kuranti" },
  { key: "retail", label: "Магазин", slug: "vintage-shop" },
] as const;
