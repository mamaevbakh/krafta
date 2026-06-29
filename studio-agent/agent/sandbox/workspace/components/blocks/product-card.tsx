import type { Currency, Item } from "@/lib/commerce-client";
import { Card } from "@/components/ui/card";
import { Price } from "@/components/commerce/price";

// Fully editable presentational card — the agent rewrites layout/markup freely.
// Money renders only through <Price>; the value comes from the engine.
export function ProductCard({
  item,
  currency,
}: {
  item: Item;
  currency: Currency;
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="aspect-square bg-muted">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- starter keeps deps light; agent can switch to next/image
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-medium leading-tight">{item.name}</h3>
        {item.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {item.description}
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between pt-3">
          <Price
            cents={item.priceCents}
            currency={currency}
            className="font-semibold"
          />
          {/* Add-to-cart wires up when the cart write API lands (Layer 1.5). */}
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-accent"
          >
            Add
          </button>
        </div>
      </div>
    </Card>
  );
}
