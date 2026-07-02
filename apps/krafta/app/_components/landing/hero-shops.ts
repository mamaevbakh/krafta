/**
 * hero-shops.ts — the three demo shops behind the hero's vertical switcher.
 * Kept in its own module (not exported from a component file) so react-refresh /
 * fast-refresh stays happy: component files should export only components.
 *
 * Each `slug` is a published demo catalog on the storefront route (`/[slug]`).
 * `vintage-coffee` = Salom Coffee (café), `beshqozon` = restaurant,
 * `vintage-shop` = retail. Note the café's URL slug stays `vintage-coffee`
 * (frozen after publish for QR permanence) though its name is "Salom Coffee".
 */

export const HERO_SHOPS = [
  { key: "cafe", label: "Кафе", slug: "vintage-coffee" },
  { key: "restaurant", label: "Ресторан", slug: "beshqozon" },
  { key: "retail", label: "Магазин", slug: "vintage-shop" },
] as const;
