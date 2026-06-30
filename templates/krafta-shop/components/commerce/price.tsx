import type { Cents, Currency } from "@krafta/commerce";

/**
 * The ONLY way money renders. The value always comes from the engine (cents),
 * formatted here — never string-built or summed in the shop. Restyle the
 * <span> freely; keep the cents coming from Krafta.
 *
 * Minor units show only when present: whole amounts read "12 000 сум" (the
 * UZS-first Krafta look), while "$3.50" keeps its cents. We never round minor
 * units away — `*_cents` is major × 100 for every currency, so dropping them
 * would mis-state the price.
 */
export function Price({
  cents,
  currency,
  className,
}: {
  cents: Cents;
  currency: Currency;
  className?: string;
}) {
  const major = cents / 100;
  const digits = cents % 100 === 0 ? 0 : 2;
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(major);
  return (
    <span className={className}>
      {formatted}
      {currency.label ? ` ${currency.label}` : ""}
    </span>
  );
}
