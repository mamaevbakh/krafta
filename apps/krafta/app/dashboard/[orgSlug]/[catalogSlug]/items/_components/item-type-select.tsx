"use client";

/**
 * item-type-select.tsx — shadcn Select wrapped around the catalog item
 * product_type options.
 *
 * Stays close to raw shadcn — no custom trigger layout, no color
 * overrides. Only the `w-full` adjustment is applied so the trigger
 * stretches to match the rest of the form fields in EditorSheet
 * (Input + Textarea + Select are all full-width by default).
 *
 * The caller is responsible for the surrounding Field + FieldLabel +
 * FieldDescription so the visual chrome matches whatever form
 * vocabulary the consumer uses.
 *
 * Two enabled options surfaced: FOOD_AND_BEV + REGULAR. Other product
 * types live in CreateItemFlowDialog's "Request this feature" surface.
 */

import * as React from "react";
import { Tag, UtensilsCrossed, type LucideIcon } from "lucide-react";

import {
  Select,
  SelectContent,
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
  /** Override the default option set (tests / surfaces that enable more types). */
  options?: ItemTypeOption[];
  /** id wired through to SelectTrigger so <Label htmlFor=...> works
   *  when the caller wraps in Field. */
  id?: string;
};

export function ItemTypeSelect({
  value,
  onValueChange,
  disabled,
  options = ITEM_TYPE_OPTIONS,
  id,
}: ItemTypeSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as CatalogItemProductType)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Select item type" />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => {
          const Icon = opt.Icon;
          return (
            <SelectItem key={opt.value} value={opt.value}>
              
              <span className="flex flex-col">
                <span>{opt.title}</span>
                <span className="text-xs text-muted-foreground">
                  {opt.description}
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
