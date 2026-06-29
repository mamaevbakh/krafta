import type { Cents, Currency } from "@krafta/commerce";

/**
 * The ONLY way money renders. The value always comes from the engine (cents),
 * formatted here — never string-built or summed in the shop. Restyle the
 * <span> freely; keep the cents coming from Krafta.
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
  const formatted = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(major);
  return (
    <span className={className}>
      {formatted} {currency.label}
    </span>
  );
}
