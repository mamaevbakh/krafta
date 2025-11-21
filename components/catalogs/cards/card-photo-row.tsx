import Image from "next/image";
import type { Tables } from "@/lib/supabase/types";

type Item = Tables<"items">;

export function PhotoRowCard({
  item,
  imageUrl,
}: {
  item: Item;
  imageUrl: string | null;
}) {
  return (
    <div className="flex gap-3 rounded-xs border px-3 py-3">
      {/* Big image */}
      {imageUrl && (
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xs bg-muted">
          <Image
            src={imageUrl}
            alt={item.image_alt ?? item.name}
            fill
            className="object-cover"
          />
        </div>
      )}

      {/* Text */}
      <div className="flex min-w-0 flex-col justify-center">
        <span className="line-clamp-2 text-sm font-medium">{item.name}</span>

        {item.description && (
          <span className="mt-1 line-clamp-3 text-xs text-muted-foreground">
            {item.description}
          </span>
        )}
      </div>
    </div>
  );
}
