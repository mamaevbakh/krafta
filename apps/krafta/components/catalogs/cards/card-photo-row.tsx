import Image from "next/image";
import type { ItemCardProps } from "@/lib/catalogs/layout-registry";
import { useLocalizedItemFields } from "./use-localized-item-fields";

export function PhotoRowCard({
  item,
  imageUrl,
  activeLocale,
  defaultLocale,
}: ItemCardProps) {
  const { name, description, imageAlt } = useLocalizedItemFields(item, {
    activeLocale,
    defaultLocale,
  });

  return (
    <div className="flex gap-3 rounded-xs border px-3 py-3">
      {/* Big image */}
      {imageUrl && (
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xs bg-muted">
          <Image
            src={imageUrl}
            alt={imageAlt ?? name}
            fill
            sizes="96px"
            className="object-cover"
          />
        </div>
      )}

      {/* Text */}
      <div className="flex min-w-0 flex-col justify-center">
        <span className="line-clamp-2 text-base font-medium sm:text-sm">{name}</span>

        {description && (
          <span className="mt-1 line-clamp-3 text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </div>
    </div>
  );
}
