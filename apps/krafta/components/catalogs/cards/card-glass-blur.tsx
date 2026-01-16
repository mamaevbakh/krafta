import Image from "next/image";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import type { ItemCardProps } from "@/lib/catalogs/layout-registry";
import { formatPriceCents } from "@/lib/catalogs/pricing";

export function GlassBlurCard({
  item,
  imageUrl,
  imageAspectRatio,
  currencySettings,
}: ItemCardProps) {
  const ratio = imageAspectRatio ?? 4 / 5;

  return (
    <article className="overflow-hidden rounded-lg border bg-black text-white shadow-md">
      <div className="relative">
        {imageUrl && (
          <AspectRatio ratio={ratio} className="bg-muted">
            <Image
              src={imageUrl}
              alt={item.image_alt ?? item.name}
              fill
              className="h-full w-full object-cover"
            />
          </AspectRatio>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />

        <div className="absolute inset-x-3 bottom-3 space-y-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-white/70">
              Featured
            </p>
            <h3 className="text-base font-semibold leading-tight">
              {item.name}
            </h3>
            {item.description && (
              <p className="line-clamp-2 text-xs text-white/75">
                {item.description}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs backdrop-blur-md">
              {formatPriceCents(item.price_cents, currencySettings)}
            </span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs backdrop-blur-md">
              Ready soon
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
