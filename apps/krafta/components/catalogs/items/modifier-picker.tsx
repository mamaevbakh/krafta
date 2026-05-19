"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  PublicModifier,
  PublicModifierList,
} from "@/lib/catalogs/types";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type PickedModifier = {
  modifierId: string;
  quantity: number;
  name: string;
  basePriceCentsDelta: number;
};

export type ModifierPickerChange = {
  selections: PickedModifier[];
  isValid: boolean;
};

type Props = {
  modifierLists: PublicModifierList[];
  onChange: (change: ModifierPickerChange) => void;
  formatPrice: (cents: number) => string;
};

// Picker for an item's customer-visible modifier lists. Hidden lists never
// render here — the server applies their on_by_default modifiers at add time.
// Validity = every visible list satisfies its min/max bounds.
export function ModifierPicker({
  modifierLists,
  onChange,
  formatPrice,
}: Props) {
  const visibleLists = useMemo(
    () => modifierLists.filter((list) => !list.hidden_from_customer),
    [modifierLists],
  );

  // State: Map<modifier_list_id, Set<modifier_id>>. Single-select lists hold
  // at most one id; multi-select lists hold up to max_selected.
  const [selectionsByList, setSelectionsByList] = useState<
    Map<string, Set<string>>
  >(() => initialDefaults(visibleLists));

  // Reset selections if the underlying lists change (e.g. item changes).
  useEffect(() => {
    setSelectionsByList(initialDefaults(visibleLists));
  }, [visibleLists]);

  // Emit the flat selection + validity whenever state changes.
  useEffect(() => {
    const flat: PickedModifier[] = [];
    let valid = true;
    for (const list of visibleLists) {
      const picked = selectionsByList.get(list.id) ?? new Set<string>();
      const count = picked.size;
      if (count < list.min_selected) valid = false;
      if (list.max_selected !== null && count > list.max_selected) valid = false;
      for (const id of picked) {
        const mod = list.modifiers.find((m) => m.id === id);
        if (!mod) continue;
        flat.push({
          modifierId: mod.id,
          quantity: 1,
          name: mod.name,
          basePriceCentsDelta: mod.price_cents,
        });
      }
    }
    onChange({ selections: flat, isValid: valid });
  }, [selectionsByList, visibleLists, onChange]);

  if (visibleLists.length === 0) return null;

  return (
    <div className="space-y-5">
      {visibleLists.map((list) => {
        const picked = selectionsByList.get(list.id) ?? new Set<string>();
        const isSingleSelect = list.max_selected === 1;
        const required = list.min_selected >= 1;
        return (
          <fieldset key={list.id} className="space-y-2">
            <legend className="flex w-full items-baseline justify-between">
              <span className="text-sm font-medium text-foreground">
                {list.name}
                {required ? (
                  <span className="ml-1 text-destructive">*</span>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">
                {selectionHint(list)}
              </span>
            </legend>
            <div className="space-y-1.5">
              {list.modifiers.map((mod) => (
                <ModifierRow
                  key={mod.id}
                  modifier={mod}
                  selected={picked.has(mod.id)}
                  isSingleSelect={isSingleSelect}
                  formatPrice={formatPrice}
                  onToggle={() =>
                    setSelectionsByList((prev) =>
                      toggle(prev, list, mod.id),
                    )
                  }
                />
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function initialDefaults(
  lists: PublicModifierList[],
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const list of lists) {
    const defaults = list.modifiers
      .filter((m) => m.on_by_default)
      .map((m) => m.id);
    const cap = list.max_selected ?? Infinity;
    out.set(list.id, new Set(defaults.slice(0, cap)));
  }
  return out;
}

function toggle(
  prev: Map<string, Set<string>>,
  list: PublicModifierList,
  modId: string,
): Map<string, Set<string>> {
  const next = new Map(prev);
  const current = new Set(next.get(list.id) ?? []);
  const isSingleSelect = list.max_selected === 1;
  const required = list.min_selected >= 1;

  if (current.has(modId)) {
    // Don't allow deselecting the last option on a required single-select.
    if (isSingleSelect && required && current.size === 1) return prev;
    current.delete(modId);
  } else {
    if (isSingleSelect) {
      current.clear();
      current.add(modId);
    } else {
      const cap = list.max_selected ?? Infinity;
      if (current.size >= cap) return prev;
      current.add(modId);
    }
  }
  next.set(list.id, current);
  return next;
}

function selectionHint(list: PublicModifierList): string {
  if (list.min_selected === 1 && list.max_selected === 1) return "Choose 1";
  if (list.max_selected === null && list.min_selected === 0) return "Optional";
  if (list.min_selected === 0 && list.max_selected !== null) {
    return `Up to ${list.max_selected}`;
  }
  if (list.min_selected === list.max_selected) {
    return `Choose ${list.min_selected}`;
  }
  if (list.max_selected === null) return `At least ${list.min_selected}`;
  return `${list.min_selected}–${list.max_selected}`;
}

function ModifierRow({
  modifier,
  selected,
  isSingleSelect,
  formatPrice,
  onToggle,
}: {
  modifier: PublicModifier;
  selected: boolean;
  isSingleSelect: boolean;
  formatPrice: (cents: number) => string;
  onToggle: () => void;
}) {
  return (
    <Label
      className={cn(
        "flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2.5 text-sm transition-colors",
        selected
          ? "border-foreground bg-foreground/[0.04]"
          : "hover:bg-muted/40",
      )}
    >
      <span className="flex items-center gap-3">
        <input
          type={isSingleSelect ? "radio" : "checkbox"}
          checked={selected}
          onChange={onToggle}
          className="h-4 w-4 accent-foreground"
        />
        <span className="text-foreground">{modifier.name}</span>
      </span>
      {modifier.price_cents > 0 ? (
        <span className="text-xs text-muted-foreground tabular-nums">
          +{formatPrice(modifier.price_cents)}
        </span>
      ) : null}
    </Label>
  );
}
