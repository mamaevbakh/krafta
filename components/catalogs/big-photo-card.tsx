import Image from "next/image";
import type { Tables } from "@/lib/supabase/types";

type Item = Tables<"items">;

export function BigPhotoCard({
  item,
  imageUrl,
}: {
  item: Item;
  imageUrl: string | null;
}) {
  return (
    <div className="space-y-2 rounded-xs border p-3">
      {/* Full-width image */}
      {imageUrl && (
        
          <Image
            src={imageUrl}
            alt={item.image_alt ?? item.name}
            width={600}
            height={792}
            
            className="object-cover relative w-full overflow-hidden rounded-xs bg-muted"
          />
        
      )}

      <div className="flex justify-between items-start">
        <div className="flex-1">
          <span className="text-sm font-medium">{item.name}</span>

          {item.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {item.description}
            </p>
          )}
        </div>

        <span className="shrink-0 whitespace-nowrap text-sm font-semibold">
          ${(item.price_cents / 100).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
