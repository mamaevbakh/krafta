import Image from "next/image";
import type { Database } from "@/lib/supabase/types";

type Item = Database["public"]["Tables"]["items"]["Row"];

type CatalogItemCardProps = {
  item: Item;
  imageUrl: string | null;
};

export function CatalogItemCard({ item, imageUrl }: CatalogItemCardProps) {
  return (
    <div className="flex gap-3 rounded-xs border px-3 py-3">
      {/* Optional image */}
      {imageUrl && (
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xs bg-muted">
          <Image
            src={imageUrl}
            alt={item.image_alt ?? item.name}
            fill
            className="object-cover"
          />
        </div>
      )}

      {/* Text + price */}
      <div className="flex flex-1 items-start gap-3">

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-2 text-sm font-medium">
            {item.name}
          </span>

          {item.description && (
            <span className="mt-1 line-clamp-3 text-xs text-muted-foreground">
              {item.description}
            </span>
          )}
        </div>

        <div className="ml-1 flex shrink-0 flex-col items-end">
            <span className="text-sm font-semibold leading-none whitespace-nowrap">
              $ {(item.price_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

      </div>
    </div>
  );
}
