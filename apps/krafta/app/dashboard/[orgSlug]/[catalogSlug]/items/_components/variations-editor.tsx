"use client";

/**
 * variations-editor.tsx — KRA-86 / Slice 2 (polished).
 *
 * Hides the "default variation" concept from the merchant — mirrors
 * Square's UX:
 *   - The item gets a top-level Price field (rendered by editor-sheet.tsx,
 *     not here). That field is bound to the default variation's price.
 *   - When the item has ONLY the default (variation count = 1), this
 *     component renders only an "+ Add variation" button. The default is
 *     invisible.
 *   - When the item has 2+ variations, this component renders a list of
 *     all variations including the original default. The default has no
 *     special UI badge.
 *
 * Design vocabulary (Krafta, not Square table):
 *   Compact rows similar to LibraryRow — `h-12 rounded-md border bg-card
 *   px-3 flex items-center gap-3`. Grip on the left, name + price inline,
 *   status badge as a button, single 3-dot menu for delete.
 *
 * State management:
 *   This file exports a useVariationsState hook that the parent
 *   (editor-sheet) calls to own the local state. The hook returns the
 *   current state, validation, change payload, dispatch helpers, AND a
 *   setDefaultPrice helper that the parent's Price field uses.
 *
 *   The VariationsEditor view component is then controlled — it receives
 *   { state, helpers } from the parent and just renders. This single-
 *   source-of-truth shape lets the parent's Price field share the
 *   default's price with the editor without a back-channel.
 *
 * Currency:
 *   formatPriceCents / parsePriceInput from lib/catalogs/pricing —
 *   respects the catalog's currencySettings (label, separators,
 *   decimals). Replaces the hard-coded UZS path the original Slice 2
 *   used.
 */

import * as React from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical, MoreVertical, Plus, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  formatPriceInputValue,
  parsePriceInput,
} from "@/lib/catalogs/pricing";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import type { ItemVariation } from "@/lib/catalogs/types";
import { cn } from "@/lib/utils";

import type { ItemVariationChange } from "./actions";

// ---------------------------------------------------------------------------
// Local state shape
// ---------------------------------------------------------------------------

export type LocalVariation = {
  /** Stable client-only key used for React + dnd-kit. Equal to DB `id`
   *  for existing rows; a generated string for unsaved rows. */
  localId: string;
  /** DB id. Missing for unsaved (newly-added) rows. */
  id?: string;
  name: string;
  price_cents: number;
  ordinal: number;
  is_default: boolean;
  is_sold_out: boolean;
  /** Has the row been modified relative to its seeded initial state. */
  __dirty: boolean;
  /** Soft-delete flag. Strikethrough + undo affordance; finalized on Save. */
  __markedForDelete: boolean;
};

function freshLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function seedLocal(initial: readonly ItemVariation[]): LocalVariation[] {
  return [...initial]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((v) => ({
      localId: v.id,
      id: v.id,
      name: v.name,
      price_cents: v.price_cents,
      ordinal: v.ordinal,
      is_default: v.is_default,
      is_sold_out: v.is_sold_out,
      __dirty: false,
      __markedForDelete: false,
    }));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type ValidationError =
  | { kind: "name_empty"; localId: string }
  | { kind: "name_duplicate"; localId: string; conflictsWith: string }
  | { kind: "price_negative"; localId: string }
  | { kind: "no_rows" };

function validate(local: readonly LocalVariation[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const surviving = local.filter((v) => !v.__markedForDelete);

  if (surviving.length === 0) {
    errors.push({ kind: "no_rows" });
    return errors;
  }

  // The default exists invariantly (we never let the user end with 0 defaults
  // — the dispatch helpers auto-promote). So no "no_default" check needed
  // at this layer.

  const seenNames = new Map<string, string>(); // lowercased name → localId
  for (const v of surviving) {
    const trimmed = v.name.trim();
    if (!trimmed) {
      errors.push({ kind: "name_empty", localId: v.localId });
      continue;
    }
    const key = trimmed.toLowerCase();
    const prior = seenNames.get(key);
    if (prior) {
      errors.push({
        kind: "name_duplicate",
        localId: v.localId,
        conflictsWith: prior,
      });
    } else {
      seenNames.set(key, v.localId);
    }

    if (v.price_cents < 0) {
      errors.push({ kind: "price_negative", localId: v.localId });
    }
  }

  return errors;
}

function rowHasError(
  errors: readonly ValidationError[],
  localId: string,
): boolean {
  return errors.some(
    (e) =>
      ("localId" in e && e.localId === localId) ||
      ("conflictsWith" in e && e.conflictsWith === localId),
  );
}

// ---------------------------------------------------------------------------
// useVariationsState — single source of truth, lives in the parent.
// ---------------------------------------------------------------------------

export type VariationsState = {
  local: LocalVariation[];
  errors: ValidationError[];
  isValid: boolean;
  /** Surviving rows (not marked for delete), sorted by ordinal. */
  survivingRows: LocalVariation[];
  /** Default variation in the current local state. Always exists post-seed
   *  because the schema guarantees at least one default per item. */
  defaultVariation: LocalVariation | null;
  /** Has the merchant changed anything relative to the initial seed. */
  isDirty: boolean;
  /** RPC payload — what to dispatch on Save. */
  changes: ItemVariationChange[];
};

export type VariationsDispatch = {
  setName: (localId: string, name: string) => void;
  setPriceCents: (localId: string, cents: number) => void;
  toggleSoldOut: (localId: string) => void;
  softDelete: (localId: string) => void;
  restore: (localId: string) => void;
  /** Add a new variation. If only the default exists, the merchant is
   *  effectively opting in to "this item has variations now." */
  addRow: (opts?: { seedName?: string; seedPriceCents?: number }) => void;
  /** Reorder the surviving rows after a drag-end event. */
  reorder: (fromLocalId: string, toLocalId: string) => void;
  /** Primary-price binding — used by editor-sheet's top-level Price field
   *  when there's only one (default) variation. */
  setDefaultPrice: (cents: number) => void;
};

export function useVariationsState(
  initialVariations: readonly ItemVariation[],
): {
  state: VariationsState;
  dispatch: VariationsDispatch;
} {
  const [local, setLocal] = React.useState<LocalVariation[]>(() =>
    seedLocal(initialVariations),
  );

  // Re-seed when the parent passes a new initialVariations reference
  // (e.g. after router.refresh post-save). Identity comparison.
  const initialRef = React.useRef(initialVariations);
  React.useEffect(() => {
    if (initialRef.current !== initialVariations) {
      initialRef.current = initialVariations;
      setLocal(seedLocal(initialVariations));
    }
  }, [initialVariations]);

  // ---- Derived state -----------------------------------------------------
  const errors = React.useMemo(() => validate(local), [local]);
  const isValid = errors.length === 0;
  const survivingRows = React.useMemo(
    () =>
      [...local]
        .filter((r) => !r.__markedForDelete)
        .sort((a, b) => a.ordinal - b.ordinal),
    [local],
  );
  const defaultVariation = React.useMemo(
    () => survivingRows.find((r) => r.is_default) ?? null,
    [survivingRows],
  );

  const isDirty = React.useMemo(
    () => local.some((r) => r.__dirty || r.__markedForDelete),
    [local],
  );

  const changes = React.useMemo<ItemVariationChange[]>(() => {
    const out: ItemVariationChange[] = [];
    for (const v of local) {
      if (v.__markedForDelete) {
        if (v.id) out.push({ op: "delete", id: v.id });
        continue;
      }
      out.push({
        op: "upsert",
        ...(v.id ? { id: v.id } : {}),
        name: v.name.trim(),
        price_cents: v.price_cents,
        ordinal: v.ordinal,
        is_default: v.is_default,
        is_sold_out: v.is_sold_out,
      });
    }
    return out;
  }, [local]);

  // ---- Dispatchers -------------------------------------------------------

  const setName = React.useCallback((localId: string, name: string) => {
    setLocal((rows) =>
      rows.map((r) =>
        r.localId === localId ? { ...r, name, __dirty: true } : r,
      ),
    );
  }, []);

  const setPriceCents = React.useCallback(
    (localId: string, cents: number) => {
      setLocal((rows) =>
        rows.map((r) =>
          r.localId === localId
            ? { ...r, price_cents: cents, __dirty: r.price_cents !== cents || r.__dirty }
            : r,
        ),
      );
    },
    [],
  );

  const toggleSoldOut = React.useCallback((localId: string) => {
    setLocal((rows) =>
      rows.map((r) =>
        r.localId === localId
          ? { ...r, is_sold_out: !r.is_sold_out, __dirty: true }
          : r,
      ),
    );
  }, []);

  const softDelete = React.useCallback((localId: string) => {
    setLocal((rows) => {
      const target = rows.find((r) => r.localId === localId);
      if (!target) return rows;

      // Auto-promote next surviving row to default if target was default.
      let newDefaultLocalId: string | null = null;
      if (target.is_default) {
        const candidate = rows.find(
          (r) => r.localId !== localId && !r.__markedForDelete,
        );
        if (candidate) newDefaultLocalId = candidate.localId;
      }

      return rows.map((r) => {
        if (r.localId === localId) {
          return {
            ...r,
            __markedForDelete: true,
            __dirty: true,
            is_default: false,
          };
        }
        if (newDefaultLocalId && r.localId === newDefaultLocalId) {
          return { ...r, is_default: true, __dirty: true };
        }
        return r;
      });
    });
  }, []);

  const restore = React.useCallback((localId: string) => {
    setLocal((rows) =>
      rows.map((r) =>
        r.localId === localId
          ? { ...r, __markedForDelete: false, __dirty: true }
          : r,
      ),
    );
  }, []);

  const addRow = React.useCallback(
    (opts?: { seedName?: string; seedPriceCents?: number }) => {
      setLocal((rows) => {
        const surviving = rows.filter((r) => !r.__markedForDelete);
        const seedPrice =
          opts?.seedPriceCents ??
          surviving[surviving.length - 1]?.price_cents ??
          0;
        const nextOrdinal =
          surviving.reduce((max, r) => Math.max(max, r.ordinal), -1) + 1;
        return [
          ...rows,
          {
            localId: freshLocalId(),
            name: opts?.seedName ?? "",
            price_cents: seedPrice,
            ordinal: nextOrdinal,
            is_default: false,
            is_sold_out: false,
            __dirty: true,
            __markedForDelete: false,
          },
        ];
      });
    },
    [],
  );

  const reorder = React.useCallback(
    (fromLocalId: string, toLocalId: string) => {
      if (fromLocalId === toLocalId) return;
      setLocal((rows) => {
        const surviving = rows.filter((r) => !r.__markedForDelete);
        const fromIdx = surviving.findIndex((r) => r.localId === fromLocalId);
        const toIdx = surviving.findIndex((r) => r.localId === toLocalId);
        if (fromIdx === -1 || toIdx === -1) return rows;
        const reordered = arrayMove(surviving, fromIdx, toIdx);
        const ordinalMap = new Map<string, number>();
        reordered.forEach((r, idx) => ordinalMap.set(r.localId, idx));
        return rows.map((r) => {
          const next = ordinalMap.get(r.localId);
          if (next === undefined) return r;
          if (r.ordinal === next) return r;
          return { ...r, ordinal: next, __dirty: true };
        });
      });
    },
    [],
  );

  const setDefaultPrice = React.useCallback((cents: number) => {
    setLocal((rows) => {
      const target = rows.find((r) => r.is_default && !r.__markedForDelete);
      if (!target) return rows;
      if (target.price_cents === cents) return rows;
      return rows.map((r) =>
        r.localId === target.localId
          ? { ...r, price_cents: cents, __dirty: true }
          : r,
      );
    });
  }, []);

  const dispatch = React.useMemo<VariationsDispatch>(
    () => ({
      setName,
      setPriceCents,
      toggleSoldOut,
      softDelete,
      restore,
      addRow,
      reorder,
      setDefaultPrice,
    }),
    [
      setName,
      setPriceCents,
      toggleSoldOut,
      softDelete,
      restore,
      addRow,
      reorder,
      setDefaultPrice,
    ],
  );

  const state = React.useMemo<VariationsState>(
    () => ({
      local,
      errors,
      isValid,
      survivingRows,
      defaultVariation,
      isDirty,
      changes,
    }),
    [local, errors, isValid, survivingRows, defaultVariation, isDirty, changes],
  );

  return { state, dispatch };
}

// ---------------------------------------------------------------------------
// VariationsEditor — the visual component. Controlled by the parent's
// useVariationsState hook.
//
// Render contract:
//   - When survivingRows.length <= 1: render only the "+ Add variation"
//     button. The single (default) row is hidden — its price is edited
//     via the parent's top-level Price field.
//   - When survivingRows.length >= 2: render the full list (including the
//     row that was the original default — it has no special UI badge).
// ---------------------------------------------------------------------------

export type VariationsEditorProps = {
  state: VariationsState;
  dispatch: VariationsDispatch;
  currencySettings: CurrencySettings;
  isLocaleEditable: boolean;
};

export function VariationsEditor({
  state,
  dispatch,
  currencySettings,
  isLocaleEditable,
}: VariationsEditorProps) {
  // A6 — locale guard.
  if (!isLocaleEditable) {
    return (
      <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Switch to the default locale to edit variations. Variation names are
        not yet translatable.
      </div>
    );
  }

  const showList = state.survivingRows.length >= 2;
  // Include soft-deleted rows in the visible list when expanded so the
  // merchant sees what they marked for delete (with strikethrough + Undo).
  const renderRows = state.local
    .filter((r) => !r.__markedForDelete || showList)
    .sort((a, b) => a.ordinal - b.ordinal);
  const sortableIds = state.survivingRows.map((r) => r.localId);

  const handleAdd = () => {
    // When adding the FIRST extra variation: seed the name with the
    // existing default's name (Square pattern). Merchant can rename in
    // the list.
    if (state.survivingRows.length === 1 && state.defaultVariation) {
      dispatch.addRow({
        seedPriceCents: state.defaultVariation.price_cents,
      });
    } else {
      dispatch.addRow();
    }
  };

  return (
    <div data-slot="variations-editor" className="flex flex-col gap-2">
      {showList && (
        <VariationsList
          rows={renderRows}
          sortableIds={sortableIds}
          errors={state.errors}
          currencySettings={currencySettings}
          onNameChange={dispatch.setName}
          onPriceChange={dispatch.setPriceCents}
          onToggleSoldOut={dispatch.toggleSoldOut}
          onSoftDelete={dispatch.softDelete}
          onRestore={dispatch.restore}
          onReorder={dispatch.reorder}
        />
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={handleAdd}
      >
        <Plus className="size-4" />
        Add variation
      </Button>

      {state.errors.some((e) => e.kind === "no_rows") && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Add at least one variation.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VariationsList — the sortable list of rows. Pure-ish; receives callbacks.
// ---------------------------------------------------------------------------

type VariationsListProps = {
  rows: LocalVariation[];
  sortableIds: string[];
  errors: ValidationError[];
  currencySettings: CurrencySettings;
  onNameChange: (localId: string, name: string) => void;
  onPriceChange: (localId: string, cents: number) => void;
  onToggleSoldOut: (localId: string) => void;
  onSoftDelete: (localId: string) => void;
  onRestore: (localId: string) => void;
  onReorder: (fromLocalId: string, toLocalId: string) => void;
};

function VariationsList({
  rows,
  sortableIds,
  errors,
  currencySettings,
  onNameChange,
  onPriceChange,
  onToggleSoldOut,
  onSoftDelete,
  onRestore,
  onReorder,
}: VariationsListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      onReorder(String(active.id), String(over.id));
    },
    [onReorder],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <VariationRow
              key={row.localId}
              row={row}
              hasError={rowHasError(errors, row.localId)}
              currencySettings={currencySettings}
              onNameChange={(name) => onNameChange(row.localId, name)}
              onPriceChange={(cents) => onPriceChange(row.localId, cents)}
              onToggleSoldOut={() => onToggleSoldOut(row.localId)}
              onSoftDelete={() => onSoftDelete(row.localId)}
              onRestore={() => onRestore(row.localId)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// VariationRow — the compact Krafta-vocabulary row.
//
// Layout: [grip] [name input] [price input] [status badge] [⋯ menu]
// Height ~48px to match the EditorSheet form vocabulary (compact-comfortable;
// LibraryRow on the canvas uses 56px because it also carries a thumbnail —
// here we don't need one).
// ---------------------------------------------------------------------------

type VariationRowProps = {
  row: LocalVariation;
  hasError: boolean;
  currencySettings: CurrencySettings;
  onNameChange: (name: string) => void;
  onPriceChange: (cents: number) => void;
  onToggleSoldOut: () => void;
  onSoftDelete: () => void;
  onRestore: () => void;
};

function VariationRow({
  row,
  hasError,
  currencySettings,
  onNameChange,
  onPriceChange,
  onToggleSoldOut,
  onSoftDelete,
  onRestore,
}: VariationRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.localId, disabled: row.__markedForDelete });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : row.__markedForDelete ? 0.5 : 1,
    touchAction: "pan-y",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-error={hasError || undefined}
      data-marked-for-delete={row.__markedForDelete || undefined}
      className={cn(
        "flex h-12 items-center gap-2 rounded-md border bg-card px-2",
        hasError && "border-destructive/60 bg-destructive/5",
        row.__markedForDelete && "line-through",
      )}
    >
      {/* Drag handle */}
      {!row.__markedForDelete && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${row.name || "variation"} to reorder`}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md",
            "text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "cursor-grab active:cursor-grabbing touch-none",
          )}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      {row.__markedForDelete && (
        // Placeholder so the row layout doesn't shift when grip disappears.
        <div className="size-8 shrink-0" aria-hidden="true" />
      )}

      {/* Name input */}
      <Input
        value={row.name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Variation name"
        disabled={row.__markedForDelete}
        className="h-8 flex-1 min-w-0 border-transparent bg-transparent shadow-none focus-visible:border-input focus-visible:bg-background"
        data-slot="variation-name-input"
      />

      {/* Price input — currency-aware */}
      <VariationPriceInput
        valueCents={row.price_cents}
        onChange={onPriceChange}
        disabled={row.__markedForDelete}
        currencySettings={currencySettings}
      />

      {/* Status badge / dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={row.__markedForDelete}>
          <button
            type="button"
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium",
              "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              row.is_sold_out
                ? "bg-muted text-muted-foreground hover:bg-muted/80"
                : "bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-100 dark:hover:bg-emerald-900",
            )}
          >
            {row.is_sold_out ? "Sold out" : "Available"}
            <ChevronDown className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              if (row.is_sold_out) onToggleSoldOut();
            }}
          >
            Available
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              if (!row.is_sold_out) onToggleSoldOut();
            }}
          >
            Sold out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Actions: 3-dot menu OR restore button (when soft-deleted) */}
      {row.__markedForDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRestore}
          aria-label={`Restore ${row.name || "variation"}`}
          className="size-8 shrink-0"
        >
          <Undo2 className="size-4" />
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${row.name || "variation"}`}
              className="size-8 shrink-0"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={onSoftDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VariationPriceInput — currency-aware numeric input.
//
// Stores cents in parent state; renders the catalog's display format
// inside the field. Switches to a raw editable string while focused so
// the merchant can type without us reformatting mid-keystroke.
// ---------------------------------------------------------------------------

export type VariationPriceInputProps = {
  valueCents: number;
  onChange: (cents: number) => void;
  disabled?: boolean;
  currencySettings: CurrencySettings;
  className?: string;
  placeholder?: string;
  "data-slot"?: string;
};

export function VariationPriceInput({
  valueCents,
  onChange,
  disabled,
  currencySettings,
  className,
  placeholder,
  "data-slot": dataSlot = "variation-price-input",
}: VariationPriceInputProps) {
  const [focused, setFocused] = React.useState(false);
  const [raw, setRaw] = React.useState(() =>
    formatPriceInputValue(valueCents, currencySettings),
  );

  // Sync from prop when not focused (e.g. parent state changes via a
  // different code path — drag-reorder doesn't touch price, but a
  // setDefaultPrice from the top-level Price field does).
  React.useEffect(() => {
    if (!focused) {
      setRaw(formatPriceInputValue(valueCents, currencySettings));
    }
  }, [valueCents, focused, currencySettings]);

  return (
    <Input
      value={raw}
      onChange={(e) => {
        const next = e.target.value;
        setRaw(next);
        const parsed = parsePriceInput(next, currencySettings);
        if (parsed !== null) onChange(parsed);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setRaw(formatPriceInputValue(valueCents, currencySettings));
      }}
      disabled={disabled}
      inputMode={currencySettings.showDecimals ? "decimal" : "numeric"}
      placeholder={placeholder ?? formatPriceInputValue(0, currencySettings)}
      data-slot={dataSlot}
      className={cn(
        "h-8 w-24 shrink-0 text-right font-mono tabular-nums",
        "border-transparent bg-transparent shadow-none",
        "focus-visible:border-input focus-visible:bg-background",
        className,
      )}
    />
  );
}
