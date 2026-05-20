"use client";

/**
 * variations-editor.tsx — KRA-86 / Slice 2.
 *
 * Inline editable table for item_variations inside the EditorSheet's
 * Variations section. Adopts Square's "Variations" UI vocabulary
 * (shadcn Table with column headers + cell-based layout) while staying
 * within KRA-86's narrow scope (name, price, status, default flag).
 *
 * Layout (per plan §11.12):
 *   [grip] [Variation name (+Default pill)] [Price] [Status dropdown] [⋯]
 *
 * Per-row 3-dot menu (Actions column):
 *   - Make default (only on non-default rows)
 *   - Delete (soft-delete; click again to undo)
 *
 * State model:
 *   - LocalVariation extends ItemVariation with __dirty + __markedForDelete.
 *   - Soft-delete: row stays visible with line-through + opacity-50; undo
 *     by clicking the row's "Restore" affordance.
 *   - Brand-new rows have no `id`; the super-RPC INSERTs them.
 *   - Validation runs on every state change; isValid bubbles to parent
 *     so the EditorSheet Save button can disable.
 *
 * Parent contract:
 *   - Pass `initialVariations` once (the editor seeds local state from this).
 *   - Receive `onChange(local)` whenever local state mutates — parent
 *     stores this as the variation-changes-source for the Save dispatch.
 *   - Receive `onValidityChange(isValid)` to wire the Save button gating.
 *
 * Locale awareness (A6):
 *   - When activeLocale !== defaultLocale, the editor renders read-only
 *     with a banner. Variation name translations are deferred to a future
 *     ticket; editing on a non-default locale would silently write to
 *     the default-locale `name` column, which is confusing.
 *
 * Drag-reorder:
 *   - Local DndContext scoped to this editor. EditorSheet is portaled
 *     outside the canvas DndContext (vaul portal), so we need our own.
 *   - PointerSensor 5px activation (desktop) + TouchSensor 250ms (mobile).
 *   - On drag end, reorder + bump every row's ordinal to match the new
 *     visible order.
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
import {
  ChevronDown,
  GripVertical,
  MoreVertical,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  formatUzsCents,
  parseUzsInput,
} from "@/components/ui/inline-currency";
import { cn } from "@/lib/utils";
import type { ItemVariation } from "@/lib/catalogs/types";

import type { ItemVariationChange } from "./actions";

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

/**
 * LocalVariation — the editor's per-row state.
 *
 * Fields with `__` prefix are local-only (never persisted directly). The
 * RPC payload is derived from the un-prefixed fields on Save. The
 * `localId` field is a client-only key for React + dnd-kit (separate from
 * the DB `id`, which is missing for unsaved rows).
 */
type LocalVariation = {
  localId: string;
  id?: string;
  name: string;
  price_cents: number;
  ordinal: number;
  is_default: boolean;
  is_sold_out: boolean;
  /** True when this row has unsaved edits relative to its initial state.
   *  Brand-new rows are always dirty. */
  __dirty: boolean;
  /** Soft-delete flag — strike-through styling + the row is omitted from
   *  Save payload OR included as `{op:'delete', id}` if it has a DB id. */
  __markedForDelete: boolean;
};

function freshLocalId() {
  // crypto.randomUUID is available in modern browsers + the React 19 / Next
  // 16 runtime. Falls back to a date-based id to keep TS happy in case
  // crypto isn't typed in the target.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function seedLocalFromInitial(
  initial: readonly ItemVariation[],
): LocalVariation[] {
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
  | { kind: "no_rows" }
  | { kind: "no_default" }
  | { kind: "multiple_default" };

function validate(local: LocalVariation[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const surviving = local.filter((v) => !v.__markedForDelete);

  if (surviving.length === 0) {
    errors.push({ kind: "no_rows" });
    return errors; // No surviving rows → no further checks make sense.
  }

  // Default-flag invariants (A1 partial-unique mirrors this client-side).
  const defaults = surviving.filter((v) => v.is_default);
  if (defaults.length === 0) {
    errors.push({ kind: "no_default" });
  } else if (defaults.length > 1) {
    errors.push({ kind: "multiple_default" });
  }

  // Case-insensitive name uniqueness (CQ4).
  const seenNames = new Map<string, string>(); // lower → localId
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
  errors: ValidationError[],
  localId: string,
): boolean {
  return errors.some(
    (e) =>
      ("localId" in e && e.localId === localId) ||
      ("conflictsWith" in e && e.conflictsWith === localId),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type VariationsEditorProps = {
  /** Item id — required when the parent dispatches Save. The editor
   *  itself only uses it for stable React keys + the change payload. */
  itemId: string;
  /** Initial state from the page-level fetch. The editor seeds once and
   *  then owns local state until parent re-mounts (e.g. on Save +
   *  router.refresh re-render). */
  initialVariations: readonly ItemVariation[];
  /** Called whenever local state changes. Parent stores the latest
   *  changes payload and dispatches it on Save. */
  onChange: (changes: ItemVariationChange[]) => void;
  /** Called whenever validity changes. Parent gates the Save button. */
  onValidityChange: (isValid: boolean) => void;
  /** A6 — variation editing is locked on non-default locales. */
  isLocaleEditable: boolean;
};

export function VariationsEditor({
  itemId,
  initialVariations,
  onChange,
  onValidityChange,
  isLocaleEditable,
}: VariationsEditorProps) {
  const [local, setLocal] = React.useState<LocalVariation[]>(() =>
    seedLocalFromInitial(initialVariations),
  );

  // When the item changes (parent passes new initialVariations), re-seed.
  // Identity comparison on the array reference is sufficient since the
  // parent re-creates it from server data per render.
  const initialRef = React.useRef(initialVariations);
  React.useEffect(() => {
    if (initialRef.current !== initialVariations) {
      initialRef.current = initialVariations;
      setLocal(seedLocalFromInitial(initialVariations));
    }
  }, [initialVariations]);

  // ---- Validation + change-payload propagation -----------------------------
  const errors = React.useMemo(() => validate(local), [local]);
  const isValid = errors.length === 0;

  const changesPayload = React.useMemo<ItemVariationChange[]>(() => {
    const out: ItemVariationChange[] = [];
    for (const v of local) {
      if (v.__markedForDelete) {
        // Brand-new rows that got marked for delete → omit entirely.
        if (v.id) {
          out.push({ op: "delete", id: v.id });
        }
        continue;
      }
      // Send upserts for everything dirty OR for everything if any row in
      // the payload has changed ordinal (we re-bump ordinals on reorder,
      // so all rows below the dragged-over row are dirty). Simplest is to
      // always send the full surviving set on Save — the RPC's UPDATE
      // statements are idempotent for unchanged rows.
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

  // Effect refs to avoid re-running parent callbacks on parent re-renders.
  const onChangeRef = React.useRef(onChange);
  const onValidityChangeRef = React.useRef(onValidityChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
    onValidityChangeRef.current = onValidityChange;
  }, [onChange, onValidityChange]);

  React.useEffect(() => {
    onChangeRef.current(changesPayload);
  }, [changesPayload]);

  React.useEffect(() => {
    onValidityChangeRef.current(isValid);
  }, [isValid]);

  // ---- Mutators ------------------------------------------------------------

  const handleNameChange = React.useCallback(
    (localId: string, name: string) => {
      setLocal((rows) =>
        rows.map((r) => (r.localId === localId ? { ...r, name, __dirty: true } : r)),
      );
    },
    [],
  );

  const handlePriceChange = React.useCallback(
    (localId: string, raw: string) => {
      const parsed = parseUzsInput(raw);
      if (parsed === null) return; // Invalid input — silently ignore until typing settles.
      setLocal((rows) =>
        rows.map((r) =>
          r.localId === localId ? { ...r, price_cents: parsed, __dirty: true } : r,
        ),
      );
    },
    [],
  );

  const handleSoldOutToggle = React.useCallback((localId: string) => {
    setLocal((rows) =>
      rows.map((r) =>
        r.localId === localId
          ? { ...r, is_sold_out: !r.is_sold_out, __dirty: true }
          : r,
      ),
    );
  }, []);

  const handleMakeDefault = React.useCallback((localId: string) => {
    setLocal((rows) =>
      rows.map((r) => ({
        ...r,
        is_default: r.localId === localId,
        __dirty: r.is_default !== (r.localId === localId) ? true : r.__dirty,
      })),
    );
  }, []);

  const handleSoftDelete = React.useCallback((localId: string) => {
    setLocal((rows) => {
      const target = rows.find((r) => r.localId === localId);
      if (!target) return rows;

      // If the target is the current default AND there's at least one other
      // surviving row, auto-promote the next surviving row to default. The
      // editor never lets the merchant be stuck with "deleted default."
      const wouldHaveNoDefault =
        target.is_default &&
        rows.some(
          (r) => r.localId !== localId && !r.__markedForDelete,
        );
      let newDefaultLocalId: string | null = null;
      if (wouldHaveNoDefault) {
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

  const handleRestore = React.useCallback((localId: string) => {
    setLocal((rows) =>
      rows.map((r) =>
        r.localId === localId ? { ...r, __markedForDelete: false, __dirty: true } : r,
      ),
    );
  }, []);

  const handleAddRow = React.useCallback(() => {
    setLocal((rows) => {
      // Default the new row's price to the last surviving row's price (UX
      // shortcut — merchants typically add sizes with similar prices).
      const surviving = rows.filter((r) => !r.__markedForDelete);
      const seedPrice = surviving[surviving.length - 1]?.price_cents ?? 0;
      const nextOrdinal =
        surviving.reduce((max, r) => Math.max(max, r.ordinal), -1) + 1;
      return [
        ...rows,
        {
          localId: freshLocalId(),
          name: "",
          price_cents: seedPrice,
          ordinal: nextOrdinal,
          is_default: false,
          is_sold_out: false,
          __dirty: true,
          __markedForDelete: false,
        },
      ];
    });
  }, []);

  // ---- Drag-reorder --------------------------------------------------------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const handleDragEnd = React.useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocal((rows) => {
      const surviving = rows.filter((r) => !r.__markedForDelete);
      const fromIdx = surviving.findIndex((r) => r.localId === active.id);
      const toIdx = surviving.findIndex((r) => r.localId === over.id);
      if (fromIdx === -1 || toIdx === -1) return rows;

      const reordered = arrayMove(surviving, fromIdx, toIdx);
      // Bump ordinals to match the new visible order. We mutate __dirty
      // for any row whose ordinal actually changes; unchanged rows
      // keep their __dirty flag.
      const ordinalMap = new Map<string, number>();
      reordered.forEach((r, idx) => ordinalMap.set(r.localId, idx));

      return rows.map((r) => {
        const newOrdinal = ordinalMap.get(r.localId);
        if (newOrdinal === undefined) return r; // Marked for delete — leave alone.
        if (r.ordinal === newOrdinal) return r;
        return { ...r, ordinal: newOrdinal, __dirty: true };
      });
    });
  }, []);

  // ---- Render --------------------------------------------------------------

  // Surviving rows in render order = ordinal ASC. Soft-deleted rows render
  // INTERLEAVED at their original ordinal position so the merchant sees
  // exactly which slot is removed — Cmd+Z affordance.
  const renderRows = React.useMemo(
    () => [...local].sort((a, b) => a.ordinal - b.ordinal),
    [local],
  );
  const sortableIds = React.useMemo(
    () => renderRows.filter((r) => !r.__markedForDelete).map((r) => r.localId),
    [renderRows],
  );

  // A6 — read-only banner when editing in a non-default locale.
  if (!isLocaleEditable) {
    return (
      <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Switch to the default locale to edit variations. Variation names are
        not yet translatable — this is tracked as a follow-up.
      </div>
    );
  }

  return (
    <div data-slot="variations-editor" className="flex flex-col gap-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
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
              {renderRows.map((row) => (
                <VariationRow
                  key={row.localId}
                  row={row}
                  hasError={rowHasError(errors, row.localId)}
                  hasOtherSurvivingRows={
                    renderRows.filter(
                      (r) => !r.__markedForDelete && r.localId !== row.localId,
                    ).length > 0
                  }
                  onNameChange={(name) => handleNameChange(row.localId, name)}
                  onPriceChange={(raw) => handlePriceChange(row.localId, raw)}
                  onSoldOutToggle={() => handleSoldOutToggle(row.localId)}
                  onMakeDefault={() => handleMakeDefault(row.localId)}
                  onSoftDelete={() => handleSoftDelete(row.localId)}
                  onRestore={() => handleRestore(row.localId)}
                />
              ))}
            </SortableContext>
          </TableBody>
        </Table>
      </DndContext>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={handleAddRow}
      >
        <Plus className="size-4" />
        Add variation
      </Button>

      {/* Validation banner — surfaces top-level errors that don't belong on a
          specific row (e.g. "no surviving rows", "no default"). Per-row
          errors are visualized via `hasError` ring. */}
      {errors.length > 0 && (
        <ValidationBanner errors={errors} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-row component — useSortable wired here so the table cell layout
// stays declarative + the parent can stay focused on state management.
// ---------------------------------------------------------------------------

type VariationRowProps = {
  row: LocalVariation;
  hasError: boolean;
  hasOtherSurvivingRows: boolean;
  onNameChange: (name: string) => void;
  onPriceChange: (raw: string) => void;
  onSoldOutToggle: () => void;
  onMakeDefault: () => void;
  onSoftDelete: () => void;
  onRestore: () => void;
};

function VariationRow({
  row,
  hasError,
  hasOtherSurvivingRows,
  onNameChange,
  onPriceChange,
  onSoldOutToggle,
  onMakeDefault,
  onSoftDelete,
  onRestore,
}: VariationRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.localId, disabled: row.__markedForDelete });

  // Mirror the LibraryRow style: hide the in-place row during drag (we
  // could add a DragOverlay later if we want a floating preview clone).
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : row.__markedForDelete ? 0.5 : 1,
    touchAction: "pan-y",
  };

  // Local controlled string for the price input. We mirror the cents value
  // when not focused so the formatted "1,000" display matches the source
  // of truth.
  const [priceFocused, setPriceFocused] = React.useState(false);
  const [priceRaw, setPriceRaw] = React.useState(formatUzsCents(row.price_cents));
  React.useEffect(() => {
    if (!priceFocused) {
      setPriceRaw(formatUzsCents(row.price_cents));
    }
  }, [row.price_cents, priceFocused]);

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      data-default={row.is_default || undefined}
      data-error={hasError || undefined}
      className={cn(
        hasError && "ring-1 ring-destructive ring-inset",
        row.__markedForDelete && "line-through",
      )}
    >
      {/* Drag handle */}
      <TableCell className="w-10 text-muted-foreground">
        {!row.__markedForDelete && (
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
        )}
      </TableCell>

      {/* Name + default pill */}
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            value={row.name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Small"
            disabled={row.__markedForDelete}
            className="h-9 max-w-xs"
            data-slot="variation-name-input"
          />
          {row.is_default && (
            <span className="shrink-0 rounded-sm bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">
              Default
            </span>
          )}
        </div>
      </TableCell>

      {/* Price */}
      <TableCell className="text-right">
        <Input
          value={priceRaw}
          onChange={(e) => {
            setPriceRaw(e.target.value);
            onPriceChange(e.target.value);
          }}
          onFocus={() => setPriceFocused(true)}
          onBlur={() => {
            setPriceFocused(false);
            // On blur, reformat to canonical "1,000" display.
            setPriceRaw(formatUzsCents(row.price_cents));
          }}
          disabled={row.__markedForDelete}
          inputMode="numeric"
          className="h-9 ml-auto max-w-[120px] text-right font-mono tabular-nums"
          data-slot="variation-price-input"
        />
      </TableCell>

      {/* Status — dropdown matching Square's affordance */}
      <TableCell className="text-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={row.__markedForDelete}>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium",
                "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                row.is_sold_out
                  ? "bg-muted text-muted-foreground hover:bg-muted/80"
                  : "bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:hover:bg-emerald-900",
              )}
            >
              {row.is_sold_out ? "Sold out" : "Available"}
              <ChevronDown className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem
              onClick={() => {
                if (row.is_sold_out) onSoldOutToggle();
              }}
            >
              Available
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (!row.is_sold_out) onSoldOutToggle();
              }}
            >
              Sold out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>

      {/* Actions — 3-dot menu OR restore button (when soft-deleted) */}
      <TableCell className="w-10">
        {row.__markedForDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRestore}
            aria-label={`Restore ${row.name || "variation"}`}
            className="size-8"
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
                className="size-8"
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!row.is_default && (
                <DropdownMenuItem onClick={onMakeDefault}>
                  Make default
                </DropdownMenuItem>
              )}
              {!row.is_default && hasOtherSurvivingRows && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={onSoftDelete}
                disabled={!hasOtherSurvivingRows && row.is_default}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// ValidationBanner — surfaces top-level errors. Per-row errors render as a
// ring on the row itself; this banner handles cases without a single
// "offending row" (no rows, no default, multiple defaults).
// ---------------------------------------------------------------------------

function ValidationBanner({ errors }: { errors: readonly ValidationError[] }) {
  // Filter out per-row errors (those are already visualized via row ring).
  const banner = errors.filter(
    (e) =>
      e.kind === "no_rows" ||
      e.kind === "no_default" ||
      e.kind === "multiple_default",
  );
  if (banner.length === 0) return null;

  const messages = banner.map((e) => {
    switch (e.kind) {
      case "no_rows":
        return "Add at least one variation.";
      case "no_default":
        return "One variation must be set as default.";
      case "multiple_default":
        return "Only one variation can be the default.";
    }
  });

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      <ul className="list-disc pl-4">
        {messages.map((m, idx) => (
          <li key={idx}>{m}</li>
        ))}
      </ul>
    </div>
  );
}
