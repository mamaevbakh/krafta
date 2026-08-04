import { payLocaleTag, type PayLocale } from "@/lib/locales/locale";

/**
 * Dates, in the merchant's language.
 *
 * Every dashboard surface called `toLocaleDateString(undefined, …)`, and
 * `undefined` means the BROWSER's locale — so a merchant reading a fully Russian
 * page saw "Aug 1" next to "Оплачен". Russian is this product's default; the
 * browser's guess is not a substitute for a choice the merchant made.
 *
 * The BCP-47 mapping is `payLocaleTag`, which already existed. Worth saying why
 * that matters rather than hand-rolling a lookup: the locale codes are `ru`,
 * `uz-Latn` and `en`, and a map keyed on `uz` silently misses every Uzbek
 * merchant and falls through to the Russian default — which is exactly what an
 * earlier version of this fix did.
 */

export type DateStyle = "short" | "withYear";

const OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  /** Inside a list, where the year is noise — "1 авг." */
  short: { day: "numeric", month: "short" },
  /** On a record a merchant may reconcile months later — "1 авг. 2026 г." */
  withYear: { day: "numeric", month: "short", year: "numeric" },
};

/**
 * An em dash for a missing date rather than an empty cell, so a column reads as
 * "nothing here" instead of as a rendering failure. An unparseable value gets
 * the same treatment: `Invalid Date` in a billing table looks like the money is
 * wrong.
 */
export function formatPayDate(
  value: string | null | undefined,
  locale: PayLocale,
  style: DateStyle = "withYear",
): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(payLocaleTag(locale), OPTIONS[style]);
}

/**
 * A formatter bound to one locale.
 *
 * Server components resolve the locale once with `await getPayLocale()` and keep
 * calling `fmtDate(value)` — which is what those pages already did, so adopting
 * this is a two-line change per page rather than threading a locale through
 * every call site in a table.
 */
export function payDateFormatter(locale: PayLocale, style: DateStyle = "withYear") {
  return (value: string | null | undefined) => formatPayDate(value, locale, style);
}
