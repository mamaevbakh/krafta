import type { ItemCardProps } from "@/lib/catalogs/layout-registry";
import { useLocalizedItemFields } from "./use-localized-item-fields";

export function MinimalCard({
  item,
  activeLocale,
  defaultLocale,
}: ItemCardProps) {
  const { name, description } = useLocalizedItemFields(item, {
    activeLocale,
    defaultLocale,
  });

  return (
    <div className="flex flex-col rounded-xs border px-3 py-3">
      <span className="text-base font-medium sm:text-sm">{name}</span>

      {description && (
        <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {description}
        </span>
      )}
    </div>
  );
}
