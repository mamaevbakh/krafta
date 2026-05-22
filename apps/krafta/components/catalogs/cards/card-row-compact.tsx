/**
 * card-row-compact.tsx — KRA-36 / S9 of the ordering polish sweep.
 *
 * A photoless ~48px-tall row. Use when the merchant runs a catalog with
 * no photos (drinks-only menus, simple lunch lists) and wants density
 * over visual weight. Pattern:
 *
 *   ┌──────────────────────────────────────┐
 *   │  Latte                       18 000  │
 *   │  with milk · oat upcharge            │
 *   └──────────────────────────────────────┘
 *
 * Name on the left (line-clamp-1 so the row stays one line tall), price
 * on the right in font-mono tabular-nums so columns align between rows.
 * Description renders as a one-line subtitle when present — bumps row
 * height to ~64px, still much denser than card-default's 88px.
 *
 * Pure RSC like card-default — no event handlers, no client hooks. The
 * tap target is provided by the parent <ItemSheetTrigger /> just like
 * every other variant.
 */

import type { ItemCardProps } from "@/lib/catalogs/layout-registry";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { useLocalizedItemFields } from "./use-localized-item-fields";

export function RowCompactCard({
  item,
  currencySettings,
  activeLocale,
  defaultLocale,
}: ItemCardProps) {
  const { name, description } = useLocalizedItemFields(item, {
    activeLocale,
    defaultLocale,
  });

  return (
    <div className="flex min-h-12 items-center gap-3 rounded-xs border px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">
          {name}
        </span>
        {description ? (
          <span className="mt-0.5 truncate text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </div>
      <span className="shrink-0 whitespace-nowrap font-mono text-sm tabular-nums text-foreground">
        {formatPriceCents(item.price_cents, currencySettings)}
      </span>
    </div>
  );
}
