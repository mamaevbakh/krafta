import Image from "next/image";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import type { ItemCardProps } from "@/lib/catalogs/layout-registry";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { useLocalizedItemFields } from "./use-localized-item-fields";


export function BigPhotoCard({
  item,
  imageUrl,
  imageAspectRatio,
  currencySettings,
  activeLocale,
  defaultLocale,
}: ItemCardProps) {
  const ratio = imageAspectRatio ?? 4 / 5; // fallback if missing
  const { name, description, imageAlt } = useLocalizedItemFields(item, {
    activeLocale,
    defaultLocale,
  });

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
            alt={imageAlt ?? name ?? ""}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="h-full w-full object-cover dark:brightness-[0.9]"
          />
        </AspectRatio>
      )}

      <div className="space-y-1 px-3 py-2">
        <h3 className="truncate text-sm font-medium">{name}</h3>

        {description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {description}
          </p>
        )}
        <span className="shrink-0 whitespace-nowrap font-mono text-sm font-semibold tabular-nums">
          {formatPriceCents(item.price_cents, currencySettings)}
        </span>
        </div>


      </div>
    </article>
  );
}
