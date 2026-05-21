"use client";

import * as React from "react";
import { GripVertical, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  type DragEndEvent,
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

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  formatPriceInputValue,
  parsePriceInput,
} from "@/lib/catalogs/pricing";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";

import { saveModifierList, type ModifierKind } from "./actions";
import type { ModifierListRow, ModifierRowFromDb } from "./modifiers-panel";

/**
 * ModifierListEditorDialog — fullscreen create/edit dialog.
 *
 * shadcn `Dialog` primitive, opened at viewport size via className override
 * (`top-0 left-0 translate-x-0 translate-y-0 h-screen w-screen max-w-none
 * rounded-none border-0 p-0 gap-0 flex flex-col`). Same chrome the
 * translations workbench dialogs use (`translation-edit-dialog.tsx`,
 * `entity-translation-edit-dialog.tsx`) — the editor reads as a focused
 * page rather than a side rail, which suits a form this dense (kind toggle,
 * min/max + N draggable modifier rows + active switch).
 *
 * Layout:
 *   - Sticky top bar: title + dirty badge + Save + close X
 *   - Centered scroll body (max-w-2xl) with the form
 *
 * Dirty-tracking via JSON.stringify diff against the snapshot taken on
 * open — keeps it simple and the payload is small. Close prompts to discard
 * on dirty state.
 *
 * The modifier rows use dnd-kit (already a dep from KRA-35) for vertical
 * reorder. Ordinals are reassigned from current array index on save — no
 * separate reorder call needed in the happy path. The standalone
 * `reorderModifiers` action stays for future drag-without-save flows.
 */

type ModifierDraftRow = {
  /** Stable local id for the drag-list. For existing rows this is the DB
   *  id; for new rows it's a generated UUID-like string. The server action
   *  treats anything not in the DB's existing set as a fresh insert. */
  key: string;
  /** DB id when the row already exists; undefined for new rows. */
  id?: string;
  name: string;
  price_cents: number;
  on_by_default: boolean;
};

type EditorForm = {
  name: string;
  internal_name: string;
  modifier_type: ModifierKind;
  min_selected: number;
  max_selected: number | null;
  text_required: boolean;
  max_length: number | null;
  is_active: boolean;
  rows: ModifierDraftRow[];
};

function makeKey() {
  return `tmp-${Math.random().toString(36).slice(2, 11)}`;
}

function toFormFromList(list: ModifierListRow | null): EditorForm {
  if (!list) {
    return {
      name: "",
      internal_name: "",
      modifier_type: "list",
      min_selected: 0,
      max_selected: null,
      text_required: false,
      max_length: null,
      is_active: true,
      rows: [],
    };
  }
  return {
    name: list.name,
    internal_name: list.internal_name ?? "",
    modifier_type: list.modifier_type,
    min_selected: list.min_selected,
    max_selected: list.max_selected,
    text_required: list.text_required,
    max_length: list.max_length,
    is_active: list.is_active,
    rows: (list.modifiers ?? [])
      .filter((m) => m.is_active)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map<ModifierDraftRow>((m: ModifierRowFromDb) => ({
        key: m.id,
        id: m.id,
        name: m.name,
        price_cents: m.price_cents,
        on_by_default: m.on_by_default,
      })),
  };
}

export function ModifierListEditorDialog({
  open,
  catalogId,
  catalogSlug,
  list,
  currencySettings,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  catalogId: string;
  catalogSlug: string;
  /** null = create mode */
  list: ModifierListRow | null;
  /** Drives the per-row price input format + suffix label (e.g. "UZS").
   *  Same CurrencySettings the items page uses, so a price typed here
   *  parses identically to one typed in the variations editor. */
  currencySettings: CurrencySettings;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<EditorForm>(() => toFormFromList(list));
  const [snapshot, setSnapshot] = React.useState<string>(() =>
    JSON.stringify(toFormFromList(list)),
  );
  const [submitting, setSubmitting] = React.useState(false);

  // Re-seed form when the dialog opens or the target list changes. Without
  // this, opening Edit on list A then closing and opening Edit on list B
  // would show A's data because React's setState only runs on initial mount.
  React.useEffect(() => {
    if (!open) return;
    const next = toFormFromList(list);
    setForm(next);
    setSnapshot(JSON.stringify(next));
  }, [open, list]);

  const isDirty = React.useMemo(
    () => JSON.stringify(form) !== snapshot,
    [form, snapshot],
  );

  const isEditing = list !== null;

  function update<K extends keyof EditorForm>(key: K, value: EditorForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addRow() {
    setForm((prev) => ({
      ...prev,
      rows: [
        ...prev.rows,
        { key: makeKey(), name: "", price_cents: 0, on_by_default: false },
      ],
    }));
  }

  function removeRow(key: string) {
    setForm((prev) => ({
      ...prev,
      rows: prev.rows.filter((r) => r.key !== key),
    }));
  }

  function patchRow(key: string, patch: Partial<ModifierDraftRow>) {
    setForm((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    }));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setForm((prev) => {
      const oldIndex = prev.rows.findIndex((r) => r.key === active.id);
      const newIndex = prev.rows.findIndex((r) => r.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return { ...prev, rows: arrayMove(prev.rows, oldIndex, newIndex) };
    });
  }

  async function handleSave() {
    setSubmitting(true);
    const result = await saveModifierList({
      catalogId,
      catalogSlug,
      id: list?.id,
      name: form.name,
      internal_name: form.internal_name || null,
      modifier_type: form.modifier_type,
      min_selected: form.min_selected,
      max_selected: form.max_selected,
      text_required: form.text_required,
      max_length: form.max_length,
      is_active: form.is_active,
      modifiers: form.rows.map((r, idx) => ({
        id: r.id,
        name: r.name,
        price_cents: r.price_cents,
        ordinal: idx,
        on_by_default: r.on_by_default,
      })),
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(isEditing ? "List saved." : "List created.");
    onSaved();
  }

  function handleClose() {
    if (isDirty && !window.confirm("Discard unsaved changes?")) return;
    onOpenChange(false);
  }

  const titleText = isEditing
    ? form.name || "Modifier list"
    : "New modifier list";
  const descriptionText =
    form.modifier_type === "list"
      ? "Build a set of choices customers pick from at checkout."
      : "Let customers type a short note (size of a kid's shirt, prep request, etc.).";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          // Fullscreen override — same chrome the translations workbench
          // dialogs use. shadcn's default DialogContent is centered + max-w-lg;
          // these classes flip it to viewport-size.
          "top-0 left-0 translate-x-0 translate-y-0",
          "h-screen w-screen max-w-none sm:max-w-none",
          "rounded-none border-0 p-0 gap-0 flex flex-col",
        )}
      >
        {/* Header — sticky top bar carrying title, dirty badge, save, close.
            Custom close (X) instead of the default since the form needs a
            confirm prompt on dirty state. */}
        <div className="flex shrink-0 items-center gap-3 border-b px-6 py-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-lg font-semibold">
              {titleText}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {descriptionText}
            </DialogDescription>
          </div>
          {isDirty && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              ● Unsaved
            </span>
          )}
          <Button
            type="button"
            onClick={handleSave}
            disabled={submitting || !form.name.trim()}
            size="sm"
          >
            {submitting ? (
              <>
                <Loader2
                  className="size-3.5 animate-spin"
                  aria-hidden="true"
                />
                Saving…
              </>
            ) : isEditing ? (
              "Save changes"
            ) : (
              "Create list"
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            disabled={submitting}
            aria-label="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        {/* Body — centered scroll. max-w-2xl keeps the form measure
            comfortable on widescreens without spreading inputs edge-to-edge. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto flex max-w-2xl flex-col gap-6">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ml-name">Name</Label>
              <Input
                id="ml-name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Size, Toppings, Note for kitchen…"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                The label customers see at checkout.
              </p>
            </div>

            {/* Internal name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ml-internal">Internal name (optional)</Label>
              <Input
                id="ml-internal"
                value={form.internal_name}
                onChange={(e) => update("internal_name", e.target.value)}
                placeholder="Only you see this"
              />
            </div>

            {/* Kind */}
            <div className="flex flex-col gap-1.5">
              <Label>Kind</Label>
              <Tabs
                value={form.modifier_type}
                onValueChange={(v) => update("modifier_type", v as ModifierKind)}
              >
                <TabsList className="grid w-full max-w-xs grid-cols-2">
                  <TabsTrigger value="list">List of choices</TabsTrigger>
                  <TabsTrigger value="text">Free text</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <Separator />

            {form.modifier_type === "list" ? (
              <>
                {/* Min/max bounds */}
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ml-min">Min selections</Label>
                    <Input
                      id="ml-min"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={form.min_selected}
                      onChange={(e) =>
                        update("min_selected", Math.max(0, Number(e.target.value) || 0))
                      }
                      className="w-24"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ml-max">Max selections</Label>
                    <Input
                      id="ml-max"
                      type="number"
                      inputMode="numeric"
                      min={form.min_selected}
                      value={form.max_selected ?? ""}
                      placeholder="No limit"
                      onChange={(e) => {
                        const raw = e.target.value;
                        update(
                          "max_selected",
                          raw === "" ? null : Math.max(0, Number(raw) || 0),
                        );
                      }}
                      className="w-28"
                    />
                  </div>
                  <p className="ml-1 max-w-xs text-[11px] text-muted-foreground">
                    Set min=0 to make the list optional. Leave max blank to
                    allow any number of selections.
                  </p>
                </div>

                <Separator />

                {/* Modifier rows */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label>Choices</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addRow}
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      Add choice
                    </Button>
                  </div>

                  {form.rows.length === 0 ? (
                    <div className="rounded-md border border-dashed py-8 text-center text-xs text-muted-foreground">
                      No choices yet. Add at least one.
                    </div>
                  ) : (
                    <ModifierRowsList
                      rows={form.rows}
                      currencySettings={currencySettings}
                      onChange={patchRow}
                      onRemove={removeRow}
                      onDragEnd={handleDragEnd}
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between rounded-md border px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="ml-text-required">Text is required</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Customer must type something to add the item to cart.
                    </p>
                  </div>
                  <Switch
                    id="ml-text-required"
                    checked={form.text_required}
                    onCheckedChange={(v) => update("text_required", v)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ml-max-length">
                    Max length (optional)
                  </Label>
                  <Input
                    id="ml-max-length"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={form.max_length ?? ""}
                    placeholder="No limit"
                    onChange={(e) => {
                      const raw = e.target.value;
                      update(
                        "max_length",
                        raw === "" ? null : Math.max(1, Number(raw) || 1),
                      );
                    }}
                    className="w-32"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Cap on how long the typed note can be.
                  </p>
                </div>
              </div>
            )}

            <Separator />

            {/* Active toggle — soft delete */}
            <div className="flex items-center justify-between rounded-md border px-4 py-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="ml-active">Active</Label>
                <p className="text-[11px] text-muted-foreground">
                  Inactive lists are hidden from customer checkout but stay
                  attached to items.
                </p>
              </div>
              <Switch
                id="ml-active"
                checked={form.is_active}
                onCheckedChange={(v) => update("is_active", v)}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// ModifierRowsList — dnd-kit sortable list of modifier rows
// ============================================================================

function ModifierRowsList({
  rows,
  currencySettings,
  onChange,
  onRemove,
  onDragEnd,
}: {
  rows: ModifierDraftRow[];
  currencySettings: CurrencySettings;
  onChange: (key: string, patch: Partial<ModifierDraftRow>) => void;
  onRemove: (key: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={rows.map((r) => r.key)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <SortableModifierRow
              key={row.key}
              row={row}
              currencySettings={currencySettings}
              onChange={onChange}
              onRemove={onRemove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableModifierRow({
  row,
  currencySettings,
  onChange,
  onRemove,
}: {
  row: ModifierDraftRow;
  currencySettings: CurrencySettings;
  onChange: (key: string, patch: Partial<ModifierDraftRow>) => void;
  onRemove: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.key });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Currency-aware price input — keep the raw merchant-typed string while
  // focused so they can type "25,000" without us reformatting mid-stroke,
  // then snap back to the canonical format on blur. Mirrors the pattern
  // VariationPriceInput uses in the items editor — same parser, same
  // display contract, so a UZS catalog reads identically across surfaces.
  const [priceFocused, setPriceFocused] = React.useState(false);
  const [priceRaw, setPriceRaw] = React.useState(() =>
    formatPriceInputValue(row.price_cents, currencySettings),
  );
  React.useEffect(() => {
    if (!priceFocused) {
      setPriceRaw(formatPriceInputValue(row.price_cents, currencySettings));
    }
  }, [row.price_cents, priceFocused, currencySettings]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-2 py-1.5",
        isDragging && "z-10 shadow-md",
      )}
    >
      <button
        type="button"
        className="touch-none text-muted-foreground hover:text-foreground"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <Input
        value={row.name}
        onChange={(e) => onChange(row.key, { name: e.target.value })}
        placeholder="Choice name"
        className="h-8 flex-1 border-none bg-transparent shadow-none focus-visible:ring-1"
      />
      {/* Price + currency suffix label.  InputGroup keeps the addon
          visually attached so the merchant reads "3,000 UZS" as one
          unit. labelPosition flips prefix/suffix per catalog settings
          (USD prefix "$", UZS suffix "UZS"). */}
      <InputGroup className="h-8 w-36 shrink-0">
        <InputGroupInput
          value={priceRaw}
          onChange={(e) => {
            const next = e.target.value;
            setPriceRaw(next);
            const parsed = parsePriceInput(next, currencySettings);
            if (parsed !== null) {
              onChange(row.key, { price_cents: parsed });
            }
          }}
          onFocus={() => setPriceFocused(true)}
          onBlur={() => {
            setPriceFocused(false);
            setPriceRaw(
              formatPriceInputValue(row.price_cents, currencySettings),
            );
          }}
          inputMode={currencySettings.showDecimals ? "decimal" : "numeric"}
          placeholder={formatPriceInputValue(0, currencySettings)}
          aria-label="Price"
          className="text-right font-mono tabular-nums"
        />
        <InputGroupAddon
          align={
            currencySettings.labelPosition === "prefix"
              ? "inline-start"
              : "inline-end"
          }
          className="text-[11px] font-normal"
        >
          {currencySettings.label}
        </InputGroupAddon>
      </InputGroup>
      <label
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        title="Pre-selected for the customer by default"
      >
        <Switch
          checked={row.on_by_default}
          onCheckedChange={(v) => onChange(row.key, { on_by_default: v })}
        />
        Default
      </label>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(row.key)}
        aria-label="Remove choice"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}
