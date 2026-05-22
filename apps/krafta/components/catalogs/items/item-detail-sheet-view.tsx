import Image from "next/image";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { ItemDetailProps } from "@/lib/catalogs/layout-registry";
import { pickLocalizedField } from "@/lib/catalogs/i18n";

export function ItemDetailSheet({
  item,
  category,
  imageUrl,
  itemAspectRatio,
  activeLocale,
  defaultLocale,
}: ItemDetailProps) {
  const itemDefaults = {
    name: item.name,
    description: item.description,
    image_alt: item.image_alt,
  };
  const localizedName = pickLocalizedField({
    translations: item.translations,
    defaults: itemDefaults,
    activeLocale,
    defaultLocale,
    field: "name",
  }).value;
  const localizedDescription =
    pickLocalizedField({
      translations: item.translations,
      defaults: itemDefaults,
      activeLocale,
      defaultLocale,
      field: "description",
    }).value || null;
  const localizedCategoryName = category
    ? pickLocalizedField({
        translations: category.translations,
        defaults: {
          name: category.name,
          description: category.description ?? null,
          image_alt: null,
        },
        activeLocale,
        defaultLocale,
        field: "name",
      }).value
    : null;

  return (
    <div className="mx-auto mt-3 flex h-[80vh] max-w-sm flex-col gap-4 overflow-y-auto px-4 sm:px-6">
      {imageUrl && (
        <AspectRatio
          ratio={itemAspectRatio ?? 4 / 3}
          className="w-full overflow-hidden rounded-lg bg-muted"
        >
          <Image
            src={imageUrl}
            alt={localizedName ?? ""}
            fill
            sizes="(max-width: 640px) 100vw, 480px"
            className="h-full w-full object-cover dark:brightness-[0.9]"
          />
        </AspectRatio>
      )}

      <DrawerHeader className="flex flex-row items-start justify-between gap-3 px-0">
        <div className="space-y-1">
          {localizedCategoryName ? (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {localizedCategoryName}
            </p>
          ) : null}

          <DrawerTitle className="text-lg">
            {localizedName}
          </DrawerTitle>

          {localizedDescription && (
            <DrawerDescription className="text-sm text-muted-foreground">
              {localizedDescription}
            </DrawerDescription>
          )}
        </div>
      </DrawerHeader>
    </div>
  );
}
