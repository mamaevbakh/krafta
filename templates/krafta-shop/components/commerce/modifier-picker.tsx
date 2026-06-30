"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  Currency,
  ModifierList,
  ModifierSelection,
} from "@krafta/commerce";

import { cn } from "@/lib/utils";
import { Price } from "./price";

export type ModifierPickerValue = {
  /** Selections in the engine's `ModifierSelection` shape, ready for the cart. */
  selections: ModifierSelection[];
  /** Every visible list satisfies its min/max (and required text is filled). */
  isValid: boolean;
  /** Number of required lists still unsatisfied — drives the Add button copy. */
  missingRequired: number;
  /** Sum of selected modifier price deltas, in cents (display only). */
  priceDeltaCents: number;
};

/** Seed list-mode defaults from each modifier's `onByDefault` flag, capped at
 *  the list's max. Mirrors what the storefront pre-selects so the customer sees
 *  (and the engine charges) the same starting configuration. */
function seedDefaults(lists: ModifierList[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const list of lists) {
    if (list.type === "text") continue;
    const defaults = list.modifiers
      .filter((m) => m.onByDefault)
      .map((m) => m.id);
    const cap = list.maxSelected ?? Infinity;
    out[list.id] = defaults.slice(0, cap);
  }
  return out;
}

function listHint(list: ModifierList): string {
  if (list.type === "text") {
    if (list.textRequired) return "Required";
    return list.maxLength != null ? `Optional · up to ${list.maxLength}` : "Optional";
  }
  if (list.minSelected === 1 && list.maxSelected === 1) return "Choose 1";
  if (list.minSelected === 0 && list.maxSelected == null) return "Optional";
  if (list.minSelected === 0 && list.maxSelected != null) {
    return `Up to ${list.maxSelected}`;
  }
  if (list.minSelected === list.maxSelected) return `Choose ${list.minSelected}`;
  if (list.maxSelected == null) return `At least ${list.minSelected}`;
  return `${list.minSelected}–${list.maxSelected}`;
}

export function ModifierPicker({
  modifierLists,
  currency,
  onChange,
}: {
  modifierLists: ModifierList[];
  currency: Currency;
  /** Must be referentially stable (wrap in useCallback) — read on every change. */
  onChange: (value: ModifierPickerValue) => void;
}) {
  const [listSel, setListSel] = useState<Record<string, string[]>>(() =>
    seedDefaults(modifierLists),
  );
  const [textSel, setTextSel] = useState<Record<string, string>>({});

  const derived = useMemo<ModifierPickerValue>(() => {
    const selections: ModifierSelection[] = [];
    let isValid = true;
    let missingRequired = 0;
    let priceDeltaCents = 0;

    for (const list of modifierLists) {
      if (list.type === "text") {
        const text = (textSel[list.id] ?? "").trim();
        if (list.textRequired && text.length === 0) {
          isValid = false;
          missingRequired += 1;
        }
        if (text.length > 0) {
          selections.push({ modifierListId: list.id, text });
        }
        continue;
      }
      const ids = listSel[list.id] ?? [];
      if (ids.length < list.minSelected) {
        isValid = false;
        missingRequired += 1;
      }
      if (list.maxSelected != null && ids.length > list.maxSelected) {
        isValid = false;
      }
      if (ids.length > 0) {
        selections.push({ modifierListId: list.id, modifierIds: ids });
        for (const id of ids) {
          const mod = list.modifiers.find((m) => m.id === id);
          if (mod) priceDeltaCents += mod.priceCents;
        }
      }
    }
    return { selections, isValid, missingRequired, priceDeltaCents };
  }, [modifierLists, listSel, textSel]);

  useEffect(() => {
    onChange(derived);
  }, [derived, onChange]);

  if (modifierLists.length === 0) return null;

  const toggleList = (list: ModifierList, modifierId: string) => {
    setListSel((prev) => {
      const ids = prev[list.id] ?? [];
      const has = ids.includes(modifierId);
      // Single-select: replace (and never drop below a required min of 1).
      if (list.maxSelected === 1) {
        if (has) return prev;
        return { ...prev, [list.id]: [modifierId] };
      }
      // Multi-select: toggle; block adding past the cap.
      if (has) {
        return { ...prev, [list.id]: ids.filter((id) => id !== modifierId) };
      }
      if (list.maxSelected != null && ids.length >= list.maxSelected) return prev;
      return { ...prev, [list.id]: [...ids, modifierId] };
    });
  };

  return (
    <div className="space-y-4">
      {modifierLists.map((list) => {
        const required =
          list.type === "text" ? list.textRequired : list.minSelected >= 1;
        return (
          <section
            key={list.id}
            className="space-y-2 rounded-lg border border-border bg-card p-4"
            aria-labelledby={`mod-${list.id}`}
          >
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  id={`mod-${list.id}`}
                  className="text-sm font-medium text-foreground"
                >
                  {list.name}
                </p>
                <p className="text-xs text-muted-foreground">{listHint(list)}</p>
              </div>
              {required ? (
                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Required
                </span>
              ) : null}
            </header>

            {list.type === "text" ? (
              <TextModifier
                list={list}
                value={textSel[list.id] ?? ""}
                onChange={(next) =>
                  setTextSel((prev) => ({ ...prev, [list.id]: next }))
                }
              />
            ) : (
              <ul className="space-y-1.5">
                {list.modifiers.map((mod) => {
                  const ids = listSel[list.id] ?? [];
                  const selected = ids.includes(mod.id);
                  const single = list.maxSelected === 1;
                  return (
                    <li key={mod.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors",
                          selected
                            ? "border-foreground bg-accent"
                            : "border-border hover:bg-accent",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <input
                            type={single ? "radio" : "checkbox"}
                            name={single ? `mod-${list.id}` : undefined}
                            checked={selected}
                            onChange={() => toggleList(list, mod.id)}
                            className="size-4 shrink-0 accent-primary"
                          />
                          <span className="truncate text-foreground">
                            {mod.name}
                          </span>
                        </span>
                        {mod.priceCents > 0 ? (
                          <Price
                            cents={mod.priceCents}
                            currency={currency}
                            className="shrink-0 text-xs text-muted-foreground tabular-nums"
                          />
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function TextModifier({
  list,
  value,
  onChange,
}: {
  list: ModifierList;
  value: string;
  onChange: (next: string) => void;
}) {
  const useTextarea = list.maxLength == null || list.maxLength > 80;
  const shared = {
    value,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    maxLength: list.maxLength ?? undefined,
    placeholder: list.textRequired ? "Required" : "Optional",
    "aria-label": list.name,
    className:
      "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-foreground",
  };
  return (
    <div className="space-y-1">
      {useTextarea ? (
        <textarea rows={3} {...shared} className={cn(shared.className, "resize-none")} />
      ) : (
        <input type="text" {...shared} />
      )}
      {list.maxLength != null ? (
        <p className="text-right text-xs text-muted-foreground tabular-nums">
          {value.length} / {list.maxLength}
        </p>
      ) : null}
    </div>
  );
}
