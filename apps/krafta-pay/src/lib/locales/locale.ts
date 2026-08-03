/**
 * locale.ts — server-safe locale resolution for the Krafta Pay merchant UI.
 *
 * Deliberately the same shape as Krafta's `lib/locales/dashboard/locale.ts`:
 * same three locales, same Russian default, same cookie-then-Accept-Language
 * order. Two billing products from one company should not disagree about what
 * language a Tashkent merchant reads.
 *
 * The cookie name differs (`krafta_pay_locale`) because the apps sit on
 * different origins in production and a merchant may reasonably want the
 * catalog builder in one language and the billing console in another.
 *
 * Pure functions only — no "use client", no next/headers. Request-time plumbing
 * lives in server.ts so RSC pages can import this without pulling server-only
 * APIs into shared code.
 */

/** `uz-Latn` is Latin-script Uzbek — the modern default script. */
export type PayLocale = "ru" | "uz-Latn" | "en";

export const PAY_LOCALE_COOKIE = "krafta_pay_locale";

/** Display order in the switcher: market-first, then English. */
export const PAY_LOCALES: readonly PayLocale[] = ["ru", "uz-Latn", "en"] as const;

/**
 * Russian, not English. Krafta Pay's merchants are Uzbek businesses, and
 * Russian is the lingua franca of the market. English being the language the
 * code is written in is not a reason to make it the language the product
 * speaks.
 */
export const DEFAULT_PAY_LOCALE: PayLocale = "ru";

/** Each language names itself, in its own script. */
export const PAY_LOCALE_NAMES: Record<PayLocale, string> = {
  ru: "Русский",
  "uz-Latn": "O‘zbekcha",
  en: "English",
};

/** BCP-47 tag for Intl formatters. */
export function payLocaleTag(locale: PayLocale): string {
  if (locale === "en") return "en-GB";
  if (locale === "uz-Latn") return "uz-Latn-UZ";
  return "ru-RU";
}

/** Coerce an arbitrary string to a supported locale, or null if unrecognised. */
export function normalizePayLocale(value: string | null | undefined): PayLocale | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.startsWith("ru")) return "ru";
  if (lower.startsWith("uz")) return "uz-Latn";
  if (lower.startsWith("en")) return "en";
  return null;
}

/**
 * Pick a locale from an Accept-Language header, honouring q-weights.
 *
 * Browsers in this market commonly send `ru-RU,ru;q=0.9,en-US;q=0.8`, so
 * naively taking the first tag is usually right — but a merchant who has
 * explicitly ranked Uzbek above Russian should get Uzbek, and that only works
 * if the weights are read.
 */
export function resolvePayLocale(input: { acceptLanguage?: string | null }): PayLocale {
  const header = input.acceptLanguage;
  if (!header) return DEFAULT_PAY_LOCALE;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0 };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.weight - a.weight);

  for (const entry of ranked) {
    const matched = normalizePayLocale(entry.tag);
    if (matched) return matched;
  }

  return DEFAULT_PAY_LOCALE;
}
