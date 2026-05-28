"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Minus, Plus } from "lucide-react";

import type {
  PublicModifier,
  PublicModifierList,
} from "@/lib/catalogs/types";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { pickLocalizedField } from "@/lib/catalogs/i18n";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import { cn } from "@/lib/utils";

export type PickedModifier = {
  /** The parent modifier_list id. Always set — gives text-mode rows
   *  traceability back to the list even though they don't have a
   *  catalog_modifier_id. */
  modifierListId: string;
  /** For list-mode rows. `null` for text-mode rows (no modifier row
   *  exists for those — the customer types into the list directly). */
  modifierId: string | null;
  /** How many of this modifier the customer wants. Always 1 for text-
   *  mode rows; 1+ for list-mode rows that support quantity. */
  quantity: number;
  /** Customer-visible name. For list-mode rows this is the modifier's
   *  localized name; for text-mode rows it's the list's localized name
   *  (so the cart drawer can label "Note for kitchen: leave out onions"). */
  name: string;
  /** Price delta per unit. Multiplied by quantity for the cart total. */
  basePriceCentsDelta: number;
  /** Text-mode only: the customer's typed string. `null` for list-mode. */
  text_value: string | null;
};

export type ModifierPickerChange = {
  selections: PickedModifier[];
  isValid: boolean;
  /** The id of the FIRST modifier list whose constraint is unmet —
   *  either an under-min list-mode list OR an unfilled required text
   *  modifier. Drives the "scroll to first invalid required list"
   *  affordance on add-to-cart. */
  firstInvalidListId: string | null;
  /**
   * Ordered list ids of every REQUIRED modifier list that's still
   * un-satisfied. In document order (matches the visual layout), so
   * the head is always the "next thing the customer should fix." The
   * guided required-selection flow walks this array as the customer
   * makes selections.
   */
  invalidRequiredListIds: string[];
  /** Count of required selections the customer hasn't completed yet.
   *  Drives the item-detail Add button copy ("Make 2 required selections
   *  • Add ₿50"). 0 when everything required is satisfied. */
  invalidRequiredCount: number;
};

type Props = {
  modifierLists: PublicModifierList[];
  onChange: (change: ModifierPickerChange) => void;
  formatPrice: (cents: number) => string;
  /**
   * Guided required-selection flow (Careem-style).
   *
   * When `inGuidedMode` is true, each required list renders a colored
   * pill:
   *   • Satisfied → green "✓ Required"
   *   • The current pointer (matches `guidedPointerListId`) → orange
   *     "⚠ Required" + an orange border around the fieldset
   *   • Other un-satisfied required → neutral gray "Required"
   *
   * When `inGuidedMode` is false (default — the customer hasn't tapped
   * the "Make N required selections" button), every required list
   * shows a neutral gray pill regardless of satisfaction, so the
   * customer can scroll and choose calmly without colors competing
   * for attention. The pill states only flip on once the customer
   * opts into the guided flow.
   *
   * Optional lists never show a pill — only an "Optional" hint in the
   * right-side gutter.
   */
  inGuidedMode?: boolean;
  guidedPointerListId?: string | null;
};

/** Stable id pattern for the modifier-list fieldset, exported so callers
 *  (e.g. item-detail-fullscreen-view) can scrollIntoView the target. */
export function modifierListFieldsetId(listId: string): string {
  return `modifier-list-${listId}`;
}

/**
 * Hard cap on per-modifier quantity. Square uses 99; we match. The cap
 * exists so a fat-thumb tap on the + button doesn't accidentally
 * trigger a 5,000-cheese order. The list's own `max_selected` is a
 * separate constraint that caps DISTINCT modifier selections — quantity
 * is per-row.
 */
const MAX_PER_MODIFIER_QUANTITY = 99;

// Picker for an item's customer-visible modifier lists. Hidden lists never
// render here — the server applies their on_by_default modifiers at add time.
// Validity = every visible list satisfies its constraints:
//   list-mode: min/max selected
//   text-mode: !text_required || (text_value.trim().length > 0) AND
//              (max_length === null || text_value.length <= max_length)
export function ModifierPicker({
  modifierLists,
  onChange,
  formatPrice,
  inGuidedMode = false,
  guidedPointerListId = null,
}: Props) {
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const visibleLists = useMemo(
    () => modifierLists.filter((list) => !list.hidden_from_customer),
    [modifierLists],
  );

  // Per-list-name + per-modifier-name localization. Pre-resolved here so
  // both the render path and the add-to-cart snapshot use the same string
  // (otherwise the cart could show the canonical name while the picker
  // shows the translation).
  const localizedListNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const list of visibleLists) {
      map.set(
        list.id,
        pickLocalizedField({
          translations: list.translations,
          defaults: { name: list.name, description: null, image_alt: null },
          activeLocale,
          defaultLocale,
          field: "name",
        }).value,
      );
    }
    return map;
  }, [visibleLists, activeLocale, defaultLocale]);
  const localizedModifierNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const list of visibleLists) {
      for (const mod of list.modifiers) {
        map.set(
          mod.id,
          pickLocalizedField({
            translations: mod.translations,
            defaults: { name: mod.name, description: null, image_alt: null },
            activeLocale,
            defaultLocale,
            field: "name",
          }).value,
        );
      }
    }
    return map;
  }, [visibleLists, activeLocale, defaultLocale]);

  // List-mode state: per-(list_id, modifier_id) quantity. The Map<list_id,
  // Map<modifier_id, quantity>> shape replaces the previous Set<modifier_id>
  // because a modifier can now appear with quantity > 1.
  //   Quantity 0 = not selected (we drop the entry rather than store 0).
  //   List's `max_selected` caps DISTINCT selections (number of map keys),
  //   not total quantity. Each modifier is capped independently by
  //   MAX_PER_MODIFIER_QUANTITY. Matches Square's behavior.
  const [selectionsByList, setSelectionsByList] = useState<
    Map<string, Map<string, number>>
  >(() => initialDefaults(visibleLists));

  // Text-mode state: per-list_id typed string. Separate map from the
  // list-mode selections because the shapes diverge.
  const [textValueByList, setTextValueByList] = useState<Map<string, string>>(
    () => new Map(),
  );

  // Reset state when the underlying lists change (item swap, locale flip).
  // We use React's "store the previous value and reset during render"
  // pattern from
  // https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes
  // rather than useEffect→setState. Re-running setState inside an effect
  // wastes a render and trips react-hooks/set-state-in-effect.
  const [prevVisibleLists, setPrevVisibleLists] = useState(visibleLists);
  if (prevVisibleLists !== visibleLists) {
    setPrevVisibleLists(visibleLists);
    setSelectionsByList(initialDefaults(visibleLists));
    setTextValueByList(new Map());
  }

  // Emit the flat selection + validity whenever state changes.
  useEffect(() => {
    const flat: PickedModifier[] = [];
    let valid = true;
    let firstInvalidListId: string | null = null;
    let invalidRequiredCount = 0;
    const invalidRequiredListIds: string[] = [];

    for (const list of visibleLists) {
      if (list.modifier_type === "text") {
        const raw = textValueByList.get(list.id) ?? "";
        const trimmed = raw.trim();
        const hasValue = trimmed.length > 0;
        const exceedsMax =
          list.max_length !== null && raw.length > list.max_length;
        const required = list.text_required;
        // Required text: invalid when empty. Optional text: always valid
        // as long as it fits within max_length. Either way an over-cap
        // string is invalid (the input enforces maxLength but the
        // emission stays safe even if the constraint is bypassed).
        if (required && !hasValue) {
          valid = false;
          invalidRequiredCount += 1;
          invalidRequiredListIds.push(list.id);
          if (!firstInvalidListId) firstInvalidListId = list.id;
        }
        if (exceedsMax) {
          valid = false;
          if (!firstInvalidListId) firstInvalidListId = list.id;
        }
        // Only emit a PickedModifier when the customer actually typed
        // something (skip empty optional text — no point in a kitchen
        // note row that says "").
        if (hasValue && !exceedsMax) {
          flat.push({
            modifierListId: list.id,
            modifierId: null,
            quantity: 1,
            // For text rows the cart shows "List name: typed text", so
            // we use the list's localized name as the row label.
            name: localizedListNameById.get(list.id) ?? list.name,
            basePriceCentsDelta: 0,
            text_value: trimmed,
          });
        }
        continue;
      }

      // List-mode branch
      const picked = selectionsByList.get(list.id) ?? new Map<string, number>();
      const distinctCount = picked.size;
      if (distinctCount < list.min_selected) {
        valid = false;
        invalidRequiredCount += 1;
        invalidRequiredListIds.push(list.id);
        if (!firstInvalidListId) firstInvalidListId = list.id;
      }
      if (
        list.max_selected !== null &&
        distinctCount > list.max_selected
      ) {
        valid = false;
      }
      for (const [modId, quantity] of picked) {
        const mod = list.modifiers.find((m) => m.id === modId);
        if (!mod || quantity <= 0) continue;
        flat.push({
          modifierListId: list.id,
          modifierId: mod.id,
          quantity,
          name: localizedModifierNameById.get(mod.id) ?? mod.name,
          basePriceCentsDelta: mod.price_cents,
          text_value: null,
        });
      }
    }
    onChange({
      selections: flat,
      isValid: valid,
      firstInvalidListId,
      invalidRequiredListIds,
      invalidRequiredCount,
    });
  }, [
    selectionsByList,
    textValueByList,
    visibleLists,
    onChange,
    localizedModifierNameById,
    localizedListNameById,
  ]);

  if (visibleLists.length === 0) return null;

  // Derive per-list satisfied-ness for pill rendering. A required
  // list is "satisfied" when its constraints are met right now (not
  // included in invalidRequiredListIds-equivalent computation that's
  // done inside the effect above). We re-compute it here cheaply
  // because the picker already iterates these lists.
  function isRequiredListSatisfied(list: PublicModifierList): boolean {
    if (list.modifier_type === "text") {
      if (!list.text_required) return true;
      const raw = textValueByList.get(list.id) ?? "";
      const trimmed = raw.trim();
      const exceedsMax =
        list.max_length !== null && raw.length > list.max_length;
      return trimmed.length > 0 && !exceedsMax;
    }
    const picked = selectionsByList.get(list.id) ?? new Map<string, number>();
    return picked.size >= list.min_selected;
  }

  return (
    <div className="space-y-5">
      {visibleLists.map((list) => {
        const required =
          list.modifier_type === "text"
            ? list.text_required
            : list.min_selected >= 1;
        const isPointer = inGuidedMode && guidedPointerListId === list.id;
        const isSatisfied = inGuidedMode && required && isRequiredListSatisfied(list);
        const pillState: RequiredPillState | null = !required
          ? null
          : isPointer
            ? "attention"
            : isSatisfied
              ? "satisfied"
              : "neutral";
        return (
          <div
            key={list.id}
            id={modifierListFieldsetId(list.id)}
            role="group"
            aria-labelledby={`${modifierListFieldsetId(list.id)}-title`}
            className={cn(
              // Every modifier list is a card — consistent chrome
              // regardless of state (DESIGN.md: cards earn their
              // existence, each list is a logical unit of content +
              // interaction). State only flips the border color so
              // the card geometry never shifts when guidance activates.
              "space-y-3 rounded-lg border bg-card p-4 transition-colors",
              isPointer
                ? "border-warning bg-warning-muted/30"
                : "border-border",
            )}
          >
            <header className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span
                  id={`${modifierListFieldsetId(list.id)}-title`}
                  className="text-sm font-medium text-foreground"
                >
                  {localizedListNameById.get(list.id) ?? list.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {selectionHint(list)}
                </span>
              </div>
              {pillState ? <RequiredPill state={pillState} /> : null}
            </header>

            {list.modifier_type === "text" ? (
              <TextModifierInput
                list={list}
                value={textValueByList.get(list.id) ?? ""}
                onChange={(next) =>
                  setTextValueByList((prev) => {
                    const map = new Map(prev);
                    if (next.length === 0) map.delete(list.id);
                    else map.set(list.id, next);
                    return map;
                  })
                }
              />
            ) : (
              <ListModifierRows
                list={list}
                selections={
                  selectionsByList.get(list.id) ?? new Map<string, number>()
                }
                onSelectionsChange={(next) =>
                  setSelectionsByList((prev) => {
                    const map = new Map(prev);
                    map.set(list.id, next);
                    return map;
                  })
                }
                localizedModifierNameById={localizedModifierNameById}
                formatPrice={formatPrice}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// initialDefaults — seed list-mode defaults from on_by_default modifiers
// ============================================================================

function initialDefaults(
  lists: PublicModifierList[],
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const list of lists) {
    if (list.modifier_type === "text") continue;
    const defaults = list.modifiers
      .filter((m) => m.on_by_default)
      .map<[string, number]>((m) => [m.id, 1]);
    const cap = list.max_selected ?? Infinity;
    out.set(list.id, new Map(defaults.slice(0, cap)));
  }
  return out;
}

/**
 * Customer-facing hint that goes under the section title. Communicates
 * the cap / constraint in natural language. When the list is required,
 * the Required pill carries the "min ≥ 1" requirement — the hint just
 * conveys the cap so we don't double up ("Required · 1–10" reads like
 * two requirements; "Up to 10" + Required pill reads like one).
 */
function selectionHint(list: PublicModifierList): string {
  if (list.modifier_type === "text") {
    // For required text, the pill says "Required"; the hint just
    // carries the length cap when present.
    if (list.text_required) {
      return list.max_length !== null
        ? `Up to ${list.max_length} chars`
        : "";
    }
    return list.max_length !== null
      ? `Optional · up to ${list.max_length} chars`
      : "Optional";
  }
  // List-mode
  if (list.min_selected === 1 && list.max_selected === 1) return "Choose 1";
  if (list.max_selected === null && list.min_selected === 0) return "Optional";
  if (list.min_selected === 0 && list.max_selected !== null) {
    return `Up to ${list.max_selected}`;
  }
  if (list.min_selected === list.max_selected) {
    return `Choose ${list.min_selected}`;
  }
  if (list.max_selected === null) return `At least ${list.min_selected}`;
  // Required with a cap (min=1, max=N): the pill carries Required;
  // the hint just shows the cap. "Up to 10" reads naturally next to
  // a "Required" pill where "1–10" reads as a confusing range.
  if (list.min_selected === 1) {
    return `Up to ${list.max_selected}`;
  }
  // Multi-required with a separate cap — rarer edge case.
  return `Choose ${list.min_selected} to ${list.max_selected}`;
}

// ============================================================================
// TextModifierInput — free-text modifier branch
// ============================================================================

function TextModifierInput({
  list,
  value,
  onChange,
}: {
  list: PublicModifierList;
  value: string;
  onChange: (next: string) => void;
}) {
  // Pick the right control by max_length. Short caps (<= 80) feel right
  // as a single-line Input; anything larger gets a Textarea. No max_length
  // also goes Textarea since the merchant probably expects multi-line.
  const useTextarea = list.max_length === null || list.max_length > 80;
  const maxAttr = list.max_length ?? undefined;
  const placeholder = list.text_required
    ? "Required"
    : "Optional";
  // Local counter for character usage. Surfaces "23 / 150" when there's
  // a cap; absent when there isn't (Square's pattern).
  const showCounter = list.max_length !== null;

  if (useTextarea) {
    return (
      <div className="space-y-1">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxAttr}
          required={list.text_required}
          placeholder={placeholder}
          rows={3}
          className="resize-none"
          aria-label={list.name}
        />
        {showCounter && (
          <div className="flex justify-end text-xs text-muted-foreground tabular-nums">
            {value.length} / {list.max_length}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxAttr}
        required={list.text_required}
        placeholder={placeholder}
        aria-label={list.name}
      />
      {showCounter && (
        <div className="flex justify-end text-xs text-muted-foreground tabular-nums">
          {value.length} / {list.max_length}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ListModifierRows — list-mode rows with toggle + stepper
// ============================================================================

function ListModifierRows({
  list,
  selections,
  onSelectionsChange,
  localizedModifierNameById,
  formatPrice,
}: {
  list: PublicModifierList;
  selections: Map<string, number>;
  onSelectionsChange: (next: Map<string, number>) => void;
  localizedModifierNameById: Map<string, string>;
  formatPrice: (cents: number) => string;
}) {
  const isSingleSelect = list.max_selected === 1;
  const isRequired = list.min_selected >= 1;
  // Square's multi-select pattern: quantity stepper appears when the
  // list allows >1 distinct selection. Single-select lists stay binary
  // toggles (no point in "Small × 3"; pick Small or Large, not both).
  const showQuantity = !isSingleSelect;

  const toggle = (modId: string) => {
    const next = new Map(selections);
    if (next.has(modId)) {
      // Don't allow deselecting the last option on a required single-select.
      if (isSingleSelect && isRequired && next.size === 1) return;
      next.delete(modId);
    } else {
      if (isSingleSelect) {
        next.clear();
        next.set(modId, 1);
      } else {
        const cap = list.max_selected ?? Infinity;
        if (next.size >= cap) return;
        next.set(modId, 1);
      }
    }
    onSelectionsChange(next);
  };

  const setQuantity = (modId: string, quantity: number) => {
    const next = new Map(selections);
    if (quantity <= 0) {
      // Don't allow stepping below 1 via the stepper; that's the
      // checkbox's job. (If we let −0 deselect, the customer hitting
      // − one too many times would silently lose their pick.)
      return;
    }
    const capped = Math.min(quantity, MAX_PER_MODIFIER_QUANTITY);
    next.set(modId, capped);
    onSelectionsChange(next);
  };

  return (
    <div className="space-y-1.5">
      {list.modifiers.map((mod) => (
        <ModifierRow
          key={mod.id}
          modifier={mod}
          selected={selections.has(mod.id)}
          quantity={selections.get(mod.id) ?? 0}
          isSingleSelect={isSingleSelect}
          showQuantity={showQuantity}
          formatPrice={formatPrice}
          displayName={localizedModifierNameById.get(mod.id) ?? mod.name}
          onToggle={() => toggle(mod.id)}
          onQuantityChange={(q) => setQuantity(mod.id, q)}
        />
      ))}
    </div>
  );
}

// ============================================================================
// ModifierRow — single list-mode modifier with optional stepper
// ============================================================================

function ModifierRow({
  modifier,
  selected,
  quantity,
  isSingleSelect,
  showQuantity,
  formatPrice,
  displayName,
  onToggle,
  onQuantityChange,
}: {
  modifier: PublicModifier;
  selected: boolean;
  quantity: number;
  isSingleSelect: boolean;
  showQuantity: boolean;
  formatPrice: (cents: number) => string;
  displayName: string;
  onToggle: () => void;
  onQuantityChange: (q: number) => void;
}) {
  // Per-unit + total price. When quantity > 1, surface the multiplier
  // so the cart math is transparent ("+25,000 × 3 = 75,000").
  const unit = modifier.price_cents;
  const total = unit * (quantity || 1);

  return (
    <Label
      className={cn(
        "flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2.5 text-sm transition-colors",
        selected
          ? "border-foreground bg-foreground/[0.04]"
          : "hover:bg-muted/40",
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <input
          type={isSingleSelect ? "radio" : "checkbox"}
          checked={selected}
          onChange={onToggle}
          className="h-4 w-4 shrink-0 accent-foreground"
        />
        <span className="truncate text-foreground">{displayName}</span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {/* Price reads before the stepper — the customer's eye flows
         *  name → price → action. Putting the stepper at the rightmost
         *  edge also makes it the thumb-zone affordance on mobile. */}
        {unit > 0 ? (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            +{formatPrice(showQuantity && selected ? total : unit)}
            {showQuantity && selected && quantity > 1 ? (
              <span className="ml-1 text-[10px] text-muted-foreground/70">
                ({formatPrice(unit)} × {quantity})
              </span>
            ) : null}
          </span>
        ) : null}
        {showQuantity && selected ? (
          <QuantityStepper
            quantity={quantity}
            onChange={onQuantityChange}
          />
        ) : null}
      </span>
    </Label>
  );
}

// ============================================================================
// QuantityStepper — −/+ buttons + numeric badge
// ============================================================================

function QuantityStepper({
  quantity,
  onChange,
}: {
  quantity: number;
  onChange: (next: number) => void;
}) {
  const canDecrement = quantity > 1;
  const canIncrement = quantity < MAX_PER_MODIFIER_QUANTITY;
  return (
    // stopPropagation so clicks on the stepper don't trigger the
    // surrounding <Label>'s checkbox/radio toggle (that would deselect
    // the modifier every time the customer hits +).
    <div
      className="flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        type="button"
        size="icon"
        variant="outline"
        disabled={!canDecrement}
        onClick={() => onChange(quantity - 1)}
        className="size-6 rounded-full"
        aria-label="Decrease quantity"
      >
        <Minus className="size-3" aria-hidden="true" />
      </Button>
      <span className="min-w-[1.5rem] text-center text-xs font-medium tabular-nums">
        {quantity}
      </span>
      <Button
        type="button"
        size="icon"
        variant="outline"
        disabled={!canIncrement}
        onClick={() => onChange(quantity + 1)}
        className="size-6 rounded-full"
        aria-label="Increase quantity"
      >
        <Plus className="size-3" aria-hidden="true" />
      </Button>
    </div>
  );
}

// ============================================================================
// RequiredPill — three-state status badge used by the guided flow
// ============================================================================

export type RequiredPillState = "neutral" | "satisfied" | "attention";

/**
 * The "Required" status pill rendered to the right of each required
 * modifier list's name. Has three states, all reusing the same chip
 * shape and dimensions so width never shifts between transitions:
 *
 *   neutral    — gray pill, no icon. Default when the customer hasn't
 *                opted into the guided flow yet (button hasn't been
 *                tapped) OR when the list is required but un-satisfied
 *                and not the current pointer.
 *   satisfied  — green pill with ✓ icon. Only rendered when the
 *                guided flow is active AND this list's constraints
 *                are satisfied. Acts as the "this one's done"
 *                marker.
 *   attention  — orange pill with ⚠ icon. Only ever set for ONE list
 *                at a time — the current pointer in the guided flow.
 *                Pairs with an orange fieldset border to draw the
 *                customer's eye unambiguously.
 *
 * Color tokens come from packages/theme/src/styles.css. Light + dark
 * variants are handled by the CSS layer.
 */
function RequiredPill({ state }: { state: RequiredPillState }) {
  if (state === "satisfied") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-success-muted px-2 py-0.5 text-[11px] font-medium text-success"
        aria-label="Required (satisfied)"
      >
        <Check className="size-3" aria-hidden />
        Required
      </span>
    );
  }
  if (state === "attention") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md border border-warning bg-warning-muted px-2 py-0.5 text-[11px] font-medium text-warning"
        aria-label="Required (pending)"
      >
        <AlertTriangle className="size-3" aria-hidden />
        Required
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
      aria-label="Required"
    >
      Required
    </span>
  );
}
