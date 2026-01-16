import Image from "next/image";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { ItemDetailProps } from "@/lib/catalogs/layout-registry";

export function ItemDetailSheet({
  item,
  category,
  imageUrl,
  itemAspectRatio,
}: ItemDetailProps) {
  return (
    <div className="mx-auto mt-3 flex h-[80vh] max-w-sm flex-col gap-4 overflow-y-auto px-4 sm:px-6">
      {imageUrl && (
        <AspectRatio
          ratio={itemAspectRatio ?? 4 / 3}
          className="w-full overflow-hidden rounded-lg bg-muted"
        >
          <Image
            src={imageUrl}
            alt={item.name ?? ""}
            fill
            className="h-full w-full object-cover dark:brightness-[0.9]"
          />
        </AspectRatio>
      )}

      <DrawerHeader className="flex flex-row items-start justify-between gap-3 px-0">
        <div className="space-y-1">
          {category ? (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {category.name}
            </p>
          ) : null}

          <DrawerTitle className="text-lg">
            {item.name}
          </DrawerTitle>

          {item.description && (
            <DrawerDescription className="text-sm text-muted-foreground">
              {item.description}
            </DrawerDescription>
          )}
        </div>
      </DrawerHeader>
    </div>
  );
}
