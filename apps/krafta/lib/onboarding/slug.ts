// ADR 0005 §2 (eng review D8/D17) — shop-name → storefront-slug suggestion.
//
// The merchant-facing slug is chosen at Publish: we transliterate the shop
// name (overwhelmingly RU/UZ Cyrillic in this market) into the RPC's
// [a-z0-9-] alphabet, the merchant adjusts once, and publish_shop freezes it.
// Untransliterable names (emoji, CJK, symbols) yield "" — callers fall back
// to the random creation slug.
//
// Romanization is Uzbek-Latin-flavored on purpose: х→x (choyxona, not
// chokhona), ж→j, ў→o, қ→q, ғ→g, ҳ→h. Russian-specific letters use the
// common forms (ё→yo, ю→yu, я→ya, щ→sh).

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts",
  ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu",
  я: "ya",
  // Uzbek Cyrillic extras
  ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

const SLUG_MAX_LENGTH = 64;
const SLUG_MIN_LENGTH = 3;

/** Transliterates RU/UZ Cyrillic to slug-safe Latin; passes Latin through. */
export function transliterate(input: string): string {
  let out = "";
  for (const ch of input.toLowerCase()) {
    out += CYRILLIC_TO_LATIN[ch] ?? ch;
  }
  return out;
}

/**
 * Suggests a slug from a shop name. Returns "" when the name has no
 * transliterable substance (caller keeps the random creation slug instead).
 */
export function suggestSlug(name: string): string {
  const slug = transliterate(name)
    // Uzbek-Latin apostrophes (oʻ, gʻ) and similar marks vanish, not dash.
    .replace(/[ʻʼ'`’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, "");
  return slug.length >= SLUG_MIN_LENGTH ? slug : "";
}

/**
 * Appends a numeric suffix for collision retries: ("choyxona", 2) →
 * "choyxona-2", trimming the base so the result stays within 64 chars.
 */
export function suffixSlug(slug: string, n: number): string {
  const suffix = `-${n}`;
  const base = slug.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, "");
  return `${base}${suffix}`;
}

/** Matches the validation inside create_draft_shop / publish_shop. */
export function isValidSlug(slug: string): boolean {
  return (
    slug.length >= SLUG_MIN_LENGTH &&
    slug.length <= SLUG_MAX_LENGTH &&
    /^[a-z0-9-]+$/.test(slug)
  );
}
