// ADR 0005 §5 (D7) — wizard-side vertical metadata.
//
// The vertical KEY list is single-sourced from the DB enum via typegen
// (public.shop_vertical); this map only adds UI labels and icons. Adding a
// vertical = enum value + vertical_templates row (migration) + one entry here.

import { Coffee, ShoppingBag, UtensilsCrossed, type LucideIcon } from "lucide-react";

import type { Database } from "@/lib/supabase/types";

export type ShopVertical = Database["public"]["Enums"]["shop_vertical"];

export type VenueMode = "dine_in" | "pickup" | "delivery";

export const VERTICALS: Record<
  ShopVertical,
  {
    label: string;
    description: string;
    icon: LucideIcon;
    /** Modes this vertical can sensibly offer — the wizard only shows these
     *  (a retail shop has no "QR on the table"). */
    allowedModes: VenueMode[];
    /** Pre-checked modes when the template fetch fails; mirrors
     *  vertical_templates.modes so both paths start identically. */
    fallbackModes: VenueMode[];
    /** Storefront seed (RU canonical) so a brand-new shop's header isn't a
     *  bare name: a short tagline + two tags, shown until the merchant edits
     *  them in the Studio. RU because it's the storefront default locale. */
    seedDescription: string;
    seedTags: [string, string];
  }
> = {
  cafe: {
    label: "Cafe",
    description: "Coffee, pastries, counter pickup",
    icon: Coffee,
    allowedModes: ["dine_in", "pickup", "delivery"],
    fallbackModes: ["pickup", "dine_in"],
    seedDescription:
      "Свежесваренный кофе, тёплая выпечка и место, куда хочется возвращаться.",
    seedTags: ["Кофе", "Выпечка"],
  },
  restaurant: {
    label: "Restaurant",
    description: "Dine-in menu, table orders, delivery",
    icon: UtensilsCrossed,
    allowedModes: ["dine_in", "pickup", "delivery"],
    fallbackModes: ["dine_in", "pickup", "delivery"],
    seedDescription:
      "Щедрые порции, знакомые вкусы и блюда, приготовленные с душой.",
    seedTags: ["Кухня", "Свежее"],
  },
  retail: {
    label: "Retail",
    description: "Products with sizes and variations",
    icon: ShoppingBag,
    allowedModes: ["pickup", "delivery"],
    fallbackModes: ["pickup"],
    seedDescription:
      "Вещи, которые мы выбрали сами и любим — с вниманием к каждой детали.",
    seedTags: ["Новинки", "Качество"],
  },
};

export const VERTICAL_KEYS = Object.keys(VERTICALS) as ShopVertical[];

export function isShopVertical(value: string): value is ShopVertical {
  return value in VERTICALS;
}
