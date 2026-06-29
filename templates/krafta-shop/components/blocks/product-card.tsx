import type { Currency, Item } from "@krafta/commerce";
import { Price } from "@/components/commerce/price";

// Photo card mirroring the Krafta storefront: a tall product image with an "Add"
// pill overlaid bottom-right, then name / description / price below. Fully
// editable presentation; money renders only through <Price> (engine value).
export function ProductCard({
  item,
  currency,
}: {
  item: Item;
  currency: Currency;
}) {
  return (
    <article className="group flex flex-col">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border bg-muted">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- starter keeps deps light; agent can switch to next/image
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : null}
        {/* Add-to-cart: wire to the @krafta/commerce write API (createCart →
            setLines) in a client component; the engine prices every line. */}
        <button
          type="button"
          className="absolute right-2 bottom-2 inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          Add
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1 pt-3">
        <h3 className="text-sm font-semibold leading-tight">{item.name}</h3>
        {item.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {item.description}
          </p>
        ) : null}
        <Price
          cents={item.priceCents}
          currency={currency}
          className="mt-1 text-sm font-medium"
        />
      </div>
    </article>
  );
}
