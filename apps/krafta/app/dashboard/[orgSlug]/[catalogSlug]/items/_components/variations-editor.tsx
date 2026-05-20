"use client";

/**
 * variations-editor.tsx — KRA-86 / Slice 2 (final).
 *
 * Layout: shadcn <Table> with column headers, mirroring Square's
 * variations editor visually. Per-row contents:
 *   [grip] | name input | price input | status dropdown | ⋯ menu
 *
 * Behavior — mirrors Square:
 *   - HARD DELETE. Clicking the delete menu item removes the row from
 *     local state immediately (no strikethrough soft-delete + undo).
 *     The DB delete fires on Save. There's no in-editor "undo" — to
 *     restore, the merchant cancels the Save (closes the sheet without
 *     saving, which triggers the discard-changes dialog).
 *   - The "default variation" concept is hidden. The merchant edits
 *     the default's price via the top-level Price field rendered by
 *     editor-sheet.tsx (above this section). When the item has only
 *     one variation (the default), this component shows ONLY the
 *     "+ Add variation" button — the default row is invisible.
 *   - When 2+ variations exist, the table renders ALL rows including
 *     the original default. No special UI badge on the default.
 *   - If the merchant deletes the row that's currently is_default in
 *     the DB, the dispatch helper auto-promotes the next surviving
 *     row to is_default = true so the schema invariant (one default
 *     per item) is satisfied at Save time.
 *
 * Currency: formatPriceInputValue + parsePriceInput from
 *   lib/catalogs/pricing — honors the catalog's CurrencySettings.
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
import { ChevronDown, GripVertical, MoreVertical, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatPriceInputValue,
  parsePriceInput,
} from "@/lib/catalogs/pricing";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import type { ItemVariation } from "@/lib/catalogs/types";
import { cn } from "@/lib/utils";

import type { ItemVariationChange } from "./actions";

// ---------------------------------------------------------------------------
// Local state shape — no __markedForDelete (hard-delete model).
// ---------------------------------------------------------------------------

export type LocalVariation = {
  /** Stable client-only key for React + dnd-kit. Equal to DB `id` for
   *  rows that came from the server; a generated string for unsaved
   *  rows. */
  localId: string;
  /** DB id. Missing for unsaved (newly-added) rows. */
  id?: string;
  name: string;
  price_cents: number;
  ordinal: number;
  is_default: boolean;
  is_sold_out: boolean;
  /** Has the row been modified relative to its seeded initial state.
   *  Brand-new rows are always dirty. */
  __dirty: boolean;
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

  if (local.length === 0) {
    errors.push({ kind: "no_rows" });
    return errors;
  }

  const seenNames = new Map<string, string>(); // lowercased name → localId
  for (const v of local) {
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
// useVariationsState — hook owns the local state.
// ---------------------------------------------------------------------------

export type VariationsState = {
  local: LocalVariation[];
  errors: ValidationError[];
  isValid: boolean;
  /** Default variation. Always present post-seed (schema invariant). */
  defaultVariation: LocalVariation | null;
  /** Has the merchant modified anything since seed. */
  isDirty: boolean;
  /** RPC payload (upserts + deletes). Pass to updateItem on Save. */
  changes: ItemVariationChange[];
};

export type VariationsDispatch = {
  setName: (localId: string, name: string) => void;
  setPriceCents: (localId: string, cents: number) => void;
  toggleSoldOut: (localId: string) => void;
  /** Hard delete — row vanishes from local state. If it had a DB id,
   *  we queue a delete op for the Save payload. */
  deleteRow: (localId: string) => void;
  addRow: (opts?: { seedName?: string; seedPriceCents?: number }) => void;
  reorder: (fromLocalId: string, toLocalId: string) => void;
  /** Primary-price binding used by editor-sheet's top-level Price field
   *  (only meaningful when there's a single variation = the default). */
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
  /** DB ids that the merchant deleted in this session. Flushed as
   *  {op:'delete', id} on Save. */
  const [pendingDeleteIds, setPendingDeleteIds] = React.useState<string[]>([]);

  // Re-seed when the parent passes a new initialVariations reference
  // (e.g. after router.refresh post-save).
  const initialRef = React.useRef(initialVariations);
  React.useEffect(() => {
    if (initialRef.current !== initialVariations) {
      initialRef.current = initialVariations;
      setLocal(seedLocal(initialVariations));
      setPendingDeleteIds([]);
    }
  }, [initialVariations]);

  // ---- Derived state ----
  const errors = React.useMemo(() => validate(local), [local]);
  const isValid = errors.length === 0;
  const defaultVariation = React.useMemo(
    () => local.find((r) => r.is_default) ?? null,
    [local],
  );

  const isDirty = React.useMemo(
    () => local.some((r) => r.__dirty) || pendingDeleteIds.length > 0,
    [local, pendingDeleteIds],
  );

  const changes = React.useMemo<ItemVariationChange[]>(() => {
    const out: ItemVariationChange[] = [];
    for (const v of local) {
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
    for (const deletedId of pendingDeleteIds) {
      out.push({ op: "delete", id: deletedId });
    }
    return out;
  }, [local, pendingDeleteIds]);

  // ---- Dispatchers ----

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
            ? {
                ...r,
                price_cents: cents,
                __dirty: r.price_cents !== cents || r.__dirty,
              }
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

  const deleteRow = React.useCallback((localId: string) => {
    setLocal((rows) => {
      const target = rows.find((r) => r.localId === localId);
      if (!target) return rows;

      // Capture the deletion in pendingDeleteIds if it has a DB id.
      if (target.id) {
        setPendingDeleteIds((ids) =>
          ids.includes(target.id!) ? ids : [...ids, target.id!],
        );
      }

      const remaining = rows.filter((r) => r.localId !== localId);

      // Auto-promote next row to default if the deleted one was default.
      if (target.is_default && remaining.length > 0) {
        const first = remaining[0];
        return remaining.map((r) =>
          r.localId === first.localId
            ? { ...r, is_default: true, __dirty: true }
            : r,
        );
      }

      return remaining;
    });
  }, []);

  const addRow = React.useCallback(
    (opts?: { seedName?: string; seedPriceCents?: number }) => {
      setLocal((rows) => {
        const seedPrice =
          opts?.seedPriceCents ?? rows[rows.length - 1]?.price_cents ?? 0;
        const nextOrdinal =
          rows.reduce((max, r) => Math.max(max, r.ordinal), -1) + 1;
        return [
          ...rows,
          {
            localId: freshLocalId(),
            name: opts?.seedName ?? "",
            price_cents: seedPrice,
            ordinal: nextOrdinal,
            is_default: rows.length === 0, // first row is always default
            is_sold_out: false,
            __dirty: true,
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
        const fromIdx = rows.findIndex((r) => r.localId === fromLocalId);
        const toIdx = rows.findIndex((r) => r.localId === toLocalId);
        if (fromIdx === -1 || toIdx === -1) return rows;
        const reordered = arrayMove(rows, fromIdx, toIdx);
        return reordered.map((r, idx) =>
          r.ordinal === idx ? r : { ...r, ordinal: idx, __dirty: true },
        );
      });
    },
    [],
  );

  const setDefaultPrice = React.useCallback((cents: number) => {
    setLocal((rows) => {
      const target = rows.find((r) => r.is_default);
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
      deleteRow,
      addRow,
      reorder,
      setDefaultPrice,
    }),
    [
      setName,
      setPriceCents,
      toggleSoldOut,
      deleteRow,
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
      defaultVariation,
      isDirty,
      changes,
    }),
    [local, errors, isValid, defaultVariation, isDirty, changes],
  );

  return { state, dispatch };
}

// ---------------------------------------------------------------------------
// VariationsEditor — controlled component, shadcn Table layout.
//
// Renders:
//   - Nothing (just the "+ Add variation" button) when local.length === 1
//     — the lone default is edited via the top-level Price field.
//   - Full shadcn Table when local.length >= 2.
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
  if (!isLocaleEditable) {
    return (
      <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Switch to the default locale to edit variations. Variation names are
        not yet translatable.
      </div>
    );
  }

  const showList = state.local.length >= 2;

  const handleAdd = () => {
    if (state.local.length === 1 && state.defaultVariation) {
      // Seed the new row's price to match the existing default — typical
      // when merchants add sizes with similar prices.
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
        <VariationsTable
          state={state}
          dispatch={dispatch}
          currencySettings={currencySettings}
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
// VariationsTable — the shadcn Table + dnd-kit list.
// ---------------------------------------------------------------------------

type VariationsTableProps = {
  state: VariationsState;
  dispatch: VariationsDispatch;
  currencySettings: CurrencySettings;
};

function VariationsTable({
  state,
  dispatch,
  currencySettings,
}: VariationsTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      dispatch.reorder(String(active.id), String(over.id));
    },
    [dispatch],
  );

  const sortableIds = state.local.map((r) => r.localId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Variation</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-center w-32">Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
            >
              {state.local.map((row) => (
                <VariationRow
                  key={row.localId}
                  row={row}
                  hasError={rowHasError(state.errors, row.localId)}
                  currencySettings={currencySettings}
                  onNameChange={(name) => dispatch.setName(row.localId, name)}
                  onPriceChange={(cents) =>
                    dispatch.setPriceCents(row.localId, cents)
                  }
                  onToggleSoldOut={() => dispatch.toggleSoldOut(row.localId)}
                  onDelete={() => dispatch.deleteRow(row.localId)}
                />
              ))}
            </SortableContext>
          </TableBody>
        </Table>
      </div>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// VariationRow — sortable table row.
// ---------------------------------------------------------------------------

type VariationRowProps = {
  row: LocalVariation;
  hasError: boolean;
  currencySettings: CurrencySettings;
  onNameChange: (name: string) => void;
  onPriceChange: (cents: number) => void;
  onToggleSoldOut: () => void;
  onDelete: () => void;
};

function VariationRow({
  row,
  hasError,
  currencySettings,
  onNameChange,
  onPriceChange,
  onToggleSoldOut,
  onDelete,
}: VariationRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.localId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: "pan-y",
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      data-error={hasError || undefined}
      className={cn(hasError && "bg-destructive/5")}
    >
      {/* Drag handle */}
      <TableCell className="w-10 text-muted-foreground">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${row.name || "variation"} to reorder`}
          className={cn(
            "flex size-8 items-center justify-center rounded-md",
            "transition-colors hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "cursor-grab active:cursor-grabbing touch-none",
          )}
        >
          <GripVertical className="size-4" />
        </button>
      </TableCell>

      {/* Name */}
      <TableCell>
        <Input
          value={row.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Variation name"
          className={cn(
            "h-9",
            hasError && "border-destructive/60 focus-visible:border-destructive",
          )}
          data-slot="variation-name-input"
        />
      </TableCell>

      {/* Price */}
      <TableCell className="text-right">
        <VariationPriceInput
          valueCents={row.price_cents}
          onChange={onPriceChange}
          currencySettings={currencySettings}
          className="ml-auto max-w-[140px]"
        />
      </TableCell>

      {/* Status */}
      <TableCell className="text-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium",
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
          <DropdownMenuContent align="center">
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
      </TableCell>

      {/* Actions: 3-dot menu */}
      <TableCell className="w-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${row.name || "variation"}`}
              className="size-8"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// VariationPriceInput — currency-aware numeric input. Exported for the
// editor-sheet's top-level Price field to reuse the same parsing /
// formatting + UX.
// ---------------------------------------------------------------------------

export type VariationPriceInputProps = {
  valueCents: number;
  onChange: (cents: number) => void;
  disabled?: boolean;
  currencySettings: CurrencySettings;
  className?: string;
  placeholder?: string;
  id?: string;
  "data-slot"?: string;
};

export function VariationPriceInput({
  valueCents,
  onChange,
  disabled,
  currencySettings,
  className,
  placeholder,
  id,
  "data-slot": dataSlot = "variation-price-input",
}: VariationPriceInputProps) {
  const [focused, setFocused] = React.useState(false);
  const [raw, setRaw] = React.useState(() =>
    formatPriceInputValue(valueCents, currencySettings),
  );

  React.useEffect(() => {
    if (!focused) {
      setRaw(formatPriceInputValue(valueCents, currencySettings));
    }
  }, [valueCents, focused, currencySettings]);

  // When disabled, render empty — the caller (editor-sheet primary
  // Price field) is responsible for the surrounding Field's data-disabled
  // styling + FieldDescription hint. Showing the old default price
  // greyed-out was misleading once the merchant added multiple
  // variations.
  return (
    <Input
      id={id}
      value={disabled ? "" : raw}
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
      placeholder={
        disabled
          ? ""
          : (placeholder ?? formatPriceInputValue(0, currencySettings))
      }
      data-slot={dataSlot}
      className={cn(
        "h-9 text-right font-mono tabular-nums",
        className,
      )}
    />
  );
}
