"use client";

/**
 * item-type-select.tsx — product_type picker built on canonical shadcn
 * composition.
 *
 * Pattern mirrors the SelectPlan example from shadcn's Select docs:
 *   - Same `ItemTypeOptionRow` rendered inside SelectValue (trigger)
 *     AND inside each SelectItem. Trigger + items stay in lockstep with
 *     zero divergence risk.
 *   - Item / ItemMedia / ItemContent / ItemTitle / ItemDescription
 *     handle the icon + title + description layout per shadcn rules.
 *   - SelectGroup wraps SelectItems (composition rule).
 *
 * Caller composes with Field + FieldLabel for the form chrome.
 */

import * as React from "react";
import { Tag, UtensilsCrossed, type LucideIcon } from "lucide-react";

import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { CatalogItemProductType } from "./product-types";

export type ItemTypeOption = {
  value: CatalogItemProductType;
  title: string;
  description: string;
  Icon: LucideIcon;
};

export const ITEM_TYPE_OPTIONS: ItemTypeOption[] = [
  {
    value: "FOOD_AND_BEV",
    title: "Prepared food and beverage",
    description: "Best for restaurants or other food venues.",
    Icon: UtensilsCrossed,
  },
  {
    value: "REGULAR",
    title: "Physical good",
    description: "Best for retail items such as clothing or jewelry.",
    Icon: Tag,
  },
];

export type ItemTypeSelectProps = {
  value: CatalogItemProductType;
  onValueChange: (next: CatalogItemProductType) => void;
  disabled?: boolean;
  options?: ItemTypeOption[];
  /** id wired through to SelectTrigger so <FieldLabel htmlFor=...> works. */
  id?: string;
};

export function ItemTypeSelect({
  value,
  onValueChange,
  disabled,
  options = ITEM_TYPE_OPTIONS,
  id,
}: ItemTypeSelectProps) {
  const selected = options.find((o) => o.value === value);

  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as CatalogItemProductType)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="h-auto! w-full">
        <SelectValue placeholder="Select item type">
          {selected && <ItemTypeOptionRow option={selected} />}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              <ItemTypeOptionRow option={opt} />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/**
 * ItemTypeOptionRow — the same row content rendered in both the trigger
 * (via SelectValue) and each SelectItem. Single source of truth.
 */
function ItemTypeOptionRow({ option }: { option: ItemTypeOption }) {
  const Icon = option.Icon;
  return (
    <Item size="sm" className="w-full p-0">
      <ItemMedia variant="icon">
        <Icon />
      </ItemMedia>
      <ItemContent className="gap-0 normal-case">
        <ItemTitle className="font-sans">{option.title}</ItemTitle>
        <ItemDescription className="text-xs font-normal tracking-normal">
          {option.description}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}
