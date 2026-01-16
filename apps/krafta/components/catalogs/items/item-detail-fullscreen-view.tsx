 "use client";

import Image from "next/image";
import Link from "next/link";
import { Share2, XIcon } from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ItemDetailProps } from "@/lib/catalogs/layout-registry";
import { formatPriceCents } from "@/lib/catalogs/pricing";

export function ItemDetailFullscreen({
  item,
  category,
  imageUrl,
  itemAspectRatio,
  backHref,
  onClose,
  currencySettings,
}: ItemDetailProps) {
  const ratio = itemAspectRatio ?? 4 / 5;
  const handleShare = async () => {
    if (typeof window === "undefined") return;

    const url = window.location.href;

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        toast("Link copied", {
          description: "Paste it anywhere to share this item.",
        });
        return;
      } catch {
        // fall through to legacy copy
      }
    }

    try {
      const input = document.createElement("input");
      input.value = url;
      input.setAttribute("readonly", "true");
      input.style.position = "absolute";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      toast("Link copied", {
        description: "Paste it anywhere to share this item.",
      });
    } catch {
      toast.error("Unable to copy link");
    }
  };

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-y-auto bg-background text-foreground md:h-[85dvh] md:rounded-sm md:shadow-xl">
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

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/90 via-black/50 to-transparent" />

        <div className="fixed inset-x-5 top-5 z-10 flex items-center justify-between text-white/80 md:absolute">
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={handleShare}
            className="h-11 w-11 rounded-full border border-white/20 bg-black/20 text-white backdrop-blur-md hover:bg-black/30"
            aria-label="Share"
          >
            <Share2 className="size-5" />
          </Button>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              onClick={onClose}
              className="h-11 w-11 rounded-full border border-white/20 bg-black/20 text-white backdrop-blur-md hover:bg-black/30"
              aria-label="Close"
            >
              <XIcon className="size-6" />
            </Button>
          ) : (
            <Button
              asChild
              variant="ghost"
              size="icon-lg"
              className="h-11 w-11 rounded-full border border-white/20 bg-black/20 text-white backdrop-blur-md hover:bg-black/30"
            >
              <Link href={backHref ?? "#"} aria-label="Close">
                <XIcon className="size-6" />
              </Link>
            </Button>
          )}
        </div>

        <div className="absolute inset-x-5 bottom-4 space-y-2 text-white">
          {category && (
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/70">
              {category.name}
            </p>
          )}
          <h2 className="text-3xl font-semibold leading-tight">
            {item.name}
          </h2>
        </div>
      </div>

      <div className="flex-1 px-5 pb-28 pt-4">
        <div className="mt-2 space-y-3">
          <p className="text-3xl font-semibold text-foreground">
            {formatPriceCents(item.price_cents, currencySettings)}
          </p>
          <p className="text-sm text-muted-foreground">
            {item.description ??
              "A detail view designed for immersive browsing. You can add ingredients, preparation notes, or rich storytelling here later."}
          </p>
        </div>

      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 w-full border-t border-border/60 bg-background/95 backdrop-blur md:sticky">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-5 py-4">
          {onClose ? (
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full border-border/60 text-foreground hover:bg-muted/40"
            >
              Закрыть
            </Button>
          ) : (
            <Button
              asChild
              variant="outline"
              className="w-full border-border/60 text-foreground hover:bg-muted/40"
            >
              <Link href={backHref ?? "#"}>Закрыть</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
