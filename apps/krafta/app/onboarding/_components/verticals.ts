// ADR 0005 §5 (D7) — wizard-side vertical metadata.
//
// The vertical KEY list is single-sourced from the DB enum via typegen
// (public.shop_vertical); this map only adds UI labels and icons. Adding a
// vertical = enum value + vertical_templates row (migration) + one entry here.

import { Coffee, ShoppingBag, UtensilsCrossed, type LucideIcon } from "lucide-react";

import type { Database } from "@/lib/supabase/types";

export type ShopVertical = Database["public"]["Enums"]["shop_vertical"];

export const VERTICALS: Record<
  ShopVertical,
  { label: string; description: string; icon: LucideIcon }
> = {
  cafe: {
    label: "Cafe",
    description: "Coffee, pastries, counter pickup",
    icon: Coffee,
  },
  restaurant: {
    label: "Restaurant",
    description: "Dine-in menu, table orders, delivery",
    icon: UtensilsCrossed,
  },
  retail: {
    label: "Retail",
    description: "Products with sizes and variations",
    icon: ShoppingBag,
  },
};

export const VERTICAL_KEYS = Object.keys(VERTICALS) as ShopVertical[];

export function isShopVertical(value: string): value is ShopVertical {
  return value in VERTICALS;
}
