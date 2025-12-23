import Image from "next/image";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import type { ItemCardProps } from "@/lib/catalogs/layout-registry";
import { formatPriceCents } from "@/lib/catalogs/pricing";


export function BigPhotoCard({
  item,
  imageUrl,
  imageAspectRatio,
  currencySettings,
}: ItemCardProps) {
  const ratio = imageAspectRatio ?? 4 / 5; // fallback if missing

  return (
      <article className="overflow-hidden rounded-xs border bg-card text-card-foreground shadow-2xs ">
        <div className="space-y-2 rounded-xs ">
      {imageUrl && (
        <AspectRatio
          ratio={ratio}
          className="bg-muted"
        >
          <Image
            src={imageUrl}
            alt={item.name ?? ""}
            fill
            className="h-full w-full object-cover dark:brightness-[0.9]"
          />
        </AspectRatio>
      )}

      <div className="space-y-1 px-3 py-2">
        <h3 className="truncate text-sm font-medium">{item.name}</h3>

        {item.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {item.description}
          </p>
        )}
        <span className="shrink-0 whitespace-nowrap text-sm font-semibold">
          {formatPriceCents(item.price_cents, currencySettings)}
        </span>
        </div>

        
      </div>
    </article>
  );
}
