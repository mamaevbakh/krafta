/**
 * messages.ts — storefront system message catalog.
 *
 * Tiny lookup for system-rendered strings (filter chips, empty-state
 * labels, micro-copy) that need to follow the storefront's locale just
 * like merchant content does. This is the counterpart to the locale
 * registry: registry.ts owns language metadata (display name, text
 * direction), this file owns the system-message strings.
 *
 * Why a hand-rolled lookup instead of next-intl / react-intl:
 *   - There are <10 system strings on the storefront.
 *   - We already have a per-catalog locale resolver
 *     (resolveStorefrontLocale) that picks the active locale; we don't
 *     need a full ICU pipeline.
 *   - Server-safe: pure object map, zero React runtime.
 *
 * Resolution order matches pickLocalizedField for merchant content:
 *   activeLocale → defaultLocale → "en"
 *
 * Adding a new message:
 *   1. Add the key to STOREFRONT_MESSAGES.<locale>.
 *   2. Fill it in for every locale we register (registry.ts). Missing
 *      entries fall back to English, which is acceptable but visible.
 *   3. Call `getStorefrontMessage("<key>", { activeLocale, defaultLocale })`.
 */

export type StorefrontMessageKey = "all";

type MessageTable = Record<StorefrontMessageKey, string>;

/**
 * Per-locale message tables. Keys match `locale` strings used in
 * `catalog_locales.locale` and the locale registry — bare BCP-47 tags
 * (no region) for the common cases, scripted tags (uz-Latn) where we
 * disambiguate.
 *
 * Keep this small. The storefront's whole point is to render MERCHANT
 * content; system labels should only exist where there is no merchant
 * input to draw from (the "All" filter chip is the canonical example).
 */
const STOREFRONT_MESSAGES: Record<string, MessageTable> = {
  en: { all: "All" },
  ru: { all: "Все" },
  "uz-Latn": { all: "Hammasi" },
  "uz-Cyrl": { all: "Ҳаммаси" },
  it: { all: "Tutto" },
  tg: { all: "Ҳама" },
  "kk-Latn": { all: "Bárlıq" },
  "kk-Cyrl": { all: "Барлық" },
  ky: { all: "Баары" },
  ar: { all: "الكل" },
  fa: { all: "همه" },
  fr: { all: "Tout" },
  de: { all: "Alle" },
  es: { all: "Todo" },
  pt: { all: "Todos" },
  zh: { all: "全部" },
  ja: { all: "すべて" },
  ko: { all: "전체" },
  tr: { all: "Tümü" },
};

/**
 * getStorefrontMessage — resolve a system label to the right locale.
 *
 * Tries activeLocale first (the customer's selected language), then
 * defaultLocale (the catalog source), then English. Mirrors how
 * pickLocalizedField resolves merchant content fields so the "All"
 * chip never reads as a different language from the categories beside
 * it when both fall back.
 */
export function getStorefrontMessage(
  key: StorefrontMessageKey,
  {
    activeLocale,
    defaultLocale,
  }: { activeLocale?: string | null; defaultLocale?: string | null },
): string {
  if (activeLocale) {
    const active = STOREFRONT_MESSAGES[activeLocale];
    if (active?.[key]) return active[key];
  }
  if (defaultLocale) {
    const fallback = STOREFRONT_MESSAGES[defaultLocale];
    if (fallback?.[key]) return fallback[key];
  }
  return STOREFRONT_MESSAGES.en[key];
}
