"use client";

import * as React from "react";
import Link from "next/link";
import {
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * ModifierListsAttachment — Square-inspired per-item modifier UX.
 *
 * Replaces the chip-row picker. Layout mirrors Square's POS dashboard:
 *   - Empty state: title + helper + "Add" button on the right.
 *   - Populated: row per attached list with drag handle, name, choice
 *     preview ("Choco, Strawberry, Lemon"), min/max display, per-row
 *     overrides popover (gear icon), detach button, and a header-level
 *     "Edit" button that opens a dialog of all available lists with
 *     checkboxes.
 *
 * State model: controlled. The parent owns `attachments` (the FULL set
 * for this item, ordered by ordinal) and receives `onChange(next)` for
 * every reorder, attach, detach, or override edit. The wrapping form
 * batches the change into its Save click. No live writes from here.
 *
 * Override semantics (matches the schema's item_modifier_lists row):
 *   - minSelectedOverride / maxSelectedOverride / hiddenFromCustomerOverride
 *     are null/false by default — list-level defaults apply.
 *   - Setting any override flips the row to "customized for this item."
 *     The popover surfaces a Reset that clears all three overrides at
 *     once so the merchant can roll back without remembering each knob.
 */

export type ModifierListOption = {
  id: string;
  name: string;
  modifier_type: "list" | "text";
  min_selected: number;
  max_selected: number | null;
  text_required: boolean;
  max_length: number | null;
  is_active: boolean;
  modifiers: Array<{
    id: string;
    name: string;
    ordinal: number;
    is_active: boolean;
  }>;
};

/** Per-item attachment row. Aligns 1:1 with item_modifier_lists. */
export type ModifierAttachment = {
  modifierListId: string;
  ordinal: number;
  minSelectedOverride: number | null;
  maxSelectedOverride: number | null;
  hiddenFromCustomerOverride: boolean;
};

export type ModifierListsAttachmentProps = {
  available: ModifierListOption[];
  attachments: ModifierAttachment[];
  onChange: (next: ModifierAttachment[]) => void;
  disabled?: boolean;
  manageHref?: string;
};

// ============================================================================
// Component
// ============================================================================

export function ModifierListsAttachment({
  available,
  attachments,
  onChange,
  disabled,
  manageHref,
}: ModifierListsAttachmentProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // Sensors must be initialized unconditionally — React's rules-of-hooks
  // bars calling a hook after the empty-state early return. Carrying the
  // sensors at the top means the DndContext receives stable refs across
  // both empty and populated branches.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  );

  // Index by id for quick lookups during render — the row component
  // needs full list metadata (modifiers, min/max, kind) to draw the
  // preview + min/max chip.
  const byId = React.useMemo(() => {
    const map = new Map<string, ModifierListOption>();
    for (const l of available) map.set(l.id, l);
    return map;
  }, [available]);

  // Render order follows ordinal; we trust the parent to seed sorted.
  const sortedAttachments = React.useMemo(
    () => [...attachments].sort((a, b) => a.ordinal - b.ordinal),
    [attachments],
  );

  // Some attached ids may not be in `available` (orphaned — list was
  // deleted between page load and now). Filter at render so we don't
  // break the layout, but keep them in state so Save still detaches them.
  const renderable = sortedAttachments.filter((a) =>
    byId.has(a.modifierListId),
  );

  function patchAttachment(
    modifierListId: string,
    patch: Partial<ModifierAttachment>,
  ) {
    onChange(
      attachments.map((a) =>
        a.modifierListId === modifierListId ? { ...a, ...patch } : a,
      ),
    );
  }

  function detach(modifierListId: string) {
    // Drop the row, then renormalize ordinals so the persisted set stays
    // dense (0, 1, 2, ...). Keeps the UI predictable across reload cycles.
    const next = attachments
      .filter((a) => a.modifierListId !== modifierListId)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((a, idx) => ({ ...a, ordinal: idx }));
    onChange(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = renderable.findIndex(
      (a) => a.modifierListId === active.id,
    );
    const newIndex = renderable.findIndex(
      (a) => a.modifierListId === over.id,
    );
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(renderable, oldIndex, newIndex).map(
      (a, idx) => ({ ...a, ordinal: idx }),
    );
    // Preserve any orphaned rows (filtered out of `renderable`) by
    // tacking them on the end with ordinals after the visible set.
    const orphans = attachments
      .filter((a) => !byId.has(a.modifierListId))
      .map((a, idx) => ({ ...a, ordinal: reordered.length + idx }));
    onChange([...reordered, ...orphans]);
  }

  function commitDialogSelection(nextIds: string[]) {
    const desired = new Set(nextIds);
    const existing = new Map(
      attachments.map((a) => [a.modifierListId, a] as const),
    );
    // Preserve overrides + ordinal for rows the merchant kept; append
    // fresh attachments at the end with the next ordinal.
    const kept: ModifierAttachment[] = [];
    let nextOrdinal = 0;
    for (const a of attachments
      .slice()
      .sort((a, b) => a.ordinal - b.ordinal)) {
      if (desired.has(a.modifierListId)) {
        kept.push({ ...a, ordinal: nextOrdinal });
        nextOrdinal += 1;
      }
    }
    for (const id of nextIds) {
      if (!existing.has(id)) {
        kept.push({
          modifierListId: id,
          ordinal: nextOrdinal,
          minSelectedOverride: null,
          maxSelectedOverride: null,
          hiddenFromCustomerOverride: false,
        });
        nextOrdinal += 1;
      }
    }
    onChange(kept);
  }

  // Empty catalog — direct the merchant to create a list before
  // returning here. Square shows the same nudge.
  if (available.length === 0) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold">Modifiers</h3>
          <p className="text-xs text-muted-foreground">
            Allow customizations such as add-ons or special requests.{" "}
            {manageHref ? (
              <Link
                href={manageHref}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Create a list
              </Link>
            ) : (
              <span className="font-medium text-foreground">
                Items → Modifiers
              </span>
            )}{" "}
            first.
          </p>
        </div>
      </div>
    );
  }

  // Populated — header with Edit button, then row list.
  // Empty attachments — title + helper + Add button (Square's pattern).
  if (renderable.length === 0) {
    return (
      <>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold">Modifiers</h3>
            <p className="text-xs text-muted-foreground">
              Allow customizations such as add-ons or special requests.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-full px-4"
            disabled={disabled}
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add
          </Button>
        </div>

        <AddModifiersDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          available={available.filter((l) => l.is_active)}
          attachedIds={attachments.map((a) => a.modifierListId)}
          onCommit={commitDialogSelection}
          manageHref={manageHref}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {/* Section header — title left, Edit right. Mirrors Square's
            "Modifiers ... Edit" layout. The Edit button opens the same
            checkbox dialog the empty state's Add button does. */}
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Modifiers</h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs font-medium underline-offset-4 hover:underline"
            disabled={disabled}
            onClick={() => setDialogOpen(true)}
          >
            <Pencil className="size-3" aria-hidden="true" />
            Edit
          </Button>
        </div>

        <div className="overflow-hidden rounded-md border">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={renderable.map((a) => a.modifierListId)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="divide-y">
                {renderable.map((attachment) => {
                  const list = byId.get(attachment.modifierListId);
                  if (!list) return null;
                  return (
                    <AttachmentRow
                      key={attachment.modifierListId}
                      attachment={attachment}
                      list={list}
                      disabled={disabled}
                      onPatch={(patch) =>
                        patchAttachment(attachment.modifierListId, patch)
                      }
                      onDetach={() => detach(attachment.modifierListId)}
                    />
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      <AddModifiersDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        available={available.filter((l) => l.is_active)}
        attachedIds={attachments.map((a) => a.modifierListId)}
        onCommit={commitDialogSelection}
        manageHref={manageHref}
      />
    </>
  );
}

// ============================================================================
// AttachmentRow — Square-style row with drag, name, preview, min/max, gear, trash
// ============================================================================

function AttachmentRow({
  attachment,
  list,
  disabled,
  onPatch,
  onDetach,
}: {
  attachment: ModifierAttachment;
  list: ModifierListOption;
  disabled?: boolean;
  onPatch: (patch: Partial<ModifierAttachment>) => void;
  onDetach: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: attachment.modifierListId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Choice preview — first ~3 active modifier names. For text modifiers
  // we show the limit description instead. Matches Square's row subtitle.
  const choicePreview = React.useMemo(() => {
    if (list.modifier_type === "text") {
      if (list.max_length != null) {
        return `Text modifier: ${list.max_length} character limit`;
      }
      return "Text modifier: no limit";
    }
    const active = list.modifiers
      .filter((m) => m.is_active)
      .sort((a, b) => a.ordinal - b.ordinal);
    if (active.length === 0) return "No choices yet";
    const shown = active.slice(0, 3).map((m) => m.name);
    if (active.length > 3) shown[2] = `${shown[2]} +${active.length - 3}`;
    return shown.join(", ");
  }, [list]);

  // Right-side min/max chip. Honors per-item overrides — if set, those
  // win over the list-level defaults. For text modifiers, "Required" /
  // "Optional" is more informative than a numeric range.
  const minMaxLabel = React.useMemo(() => {
    if (list.modifier_type === "text") {
      return list.text_required ? "Required" : "Optional";
    }
    const min = attachment.minSelectedOverride ?? list.min_selected;
    const max = attachment.maxSelectedOverride ?? list.max_selected;
    const maxLabel = max == null ? "∞ max" : `${max} max`;
    return `${min} min/${maxLabel}`;
  }, [list, attachment]);

  const isCustomized =
    attachment.minSelectedOverride !== null ||
    attachment.maxSelectedOverride !== null ||
    attachment.hiddenFromCustomerOverride;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 bg-card px-3 py-3",
        isDragging && "z-10 bg-muted/40 shadow-sm",
      )}
    >
      <button
        type="button"
        className="touch-none text-muted-foreground hover:text-foreground"
        aria-label="Drag to reorder"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold">{list.name}</span>
          {!list.is_active && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Inactive
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {choicePreview}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
        <span
          className={cn(
            "text-xs tabular-nums",
            isCustomized
              ? "font-medium text-foreground"
              : "text-muted-foreground",
          )}
        >
          {minMaxLabel}
        </span>
        {attachment.hiddenFromCustomerOverride && (
          <span className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Hidden from customers
          </span>
        )}
        {isCustomized && !attachment.hiddenFromCustomerOverride && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Customized
          </span>
        )}
      </div>

      <OverrideSettingsPopover
        list={list}
        attachment={attachment}
        disabled={disabled}
        onPatch={onPatch}
      />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-destructive"
        disabled={disabled}
        onClick={onDetach}
        aria-label={`Detach ${list.name}`}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </li>
  );
}

// ============================================================================
// OverrideSettingsPopover — gear icon → per-item overrides editor
// ============================================================================

function OverrideSettingsPopover({
  list,
  attachment,
  disabled,
  onPatch,
}: {
  list: ModifierListOption;
  attachment: ModifierAttachment;
  disabled?: boolean;
  onPatch: (patch: Partial<ModifierAttachment>) => void;
}) {
  const [open, setOpen] = React.useState(false);

  const isText = list.modifier_type === "text";
  const isCustomized =
    attachment.minSelectedOverride !== null ||
    attachment.maxSelectedOverride !== null ||
    attachment.hiddenFromCustomerOverride;

  const resolvedMin = attachment.minSelectedOverride ?? list.min_selected;
  const resolvedMax = attachment.maxSelectedOverride ?? list.max_selected;

  function resetAll() {
    onPatch({
      minSelectedOverride: null,
      maxSelectedOverride: null,
      hiddenFromCustomerOverride: false,
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "size-8 text-muted-foreground hover:text-foreground",
            isCustomized && "text-foreground",
          )}
          disabled={disabled}
          aria-label={`Settings for ${list.name}`}
        >
          <Settings2 className="size-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex flex-col gap-3 px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">
              {list.name} &middot; for this item
            </span>
            <span className="text-xs text-muted-foreground">
              Override the list&rsquo;s defaults for this item only. List-wide
              settings stay untouched.
            </span>
          </div>

          {isText ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="flex flex-col gap-0.5">
                <Label className="text-xs font-medium">Behavior</Label>
                <span className="text-xs text-muted-foreground">
                  {list.text_required ? "Required text" : "Optional text"}
                  {list.max_length != null
                    ? ` · ${list.max_length} char limit`
                    : ""}
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                List-level
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor={`min-${attachment.modifierListId}`}
                  className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Min
                </Label>
                <Input
                  id={`min-${attachment.modifierListId}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={resolvedMin}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value) || 0);
                    onPatch({
                      minSelectedOverride:
                        v === list.min_selected ? null : v,
                    });
                  }}
                  className="h-8 w-20 tabular-nums"
                />
                <span className="text-[10px] text-muted-foreground">
                  default {list.min_selected}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor={`max-${attachment.modifierListId}`}
                  className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Max
                </Label>
                <Input
                  id={`max-${attachment.modifierListId}`}
                  type="number"
                  inputMode="numeric"
                  min={resolvedMin}
                  value={resolvedMax ?? ""}
                  placeholder="No limit"
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      onPatch({
                        maxSelectedOverride:
                          list.max_selected === null ? null : null,
                      });
                      return;
                    }
                    const v = Math.max(0, Number(raw) || 0);
                    onPatch({
                      maxSelectedOverride:
                        v === list.max_selected ? null : v,
                    });
                  }}
                  className="h-8 w-24 tabular-nums"
                />
                <span className="text-[10px] text-muted-foreground">
                  default {list.max_selected ?? "no limit"}
                </span>
              </div>
            </div>
          )}

          <Separator />

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="flex flex-col gap-0.5">
              <Label
                htmlFor={`hidden-${attachment.modifierListId}`}
                className="text-xs font-medium"
              >
                Hide from customers
              </Label>
              <span className="text-[11px] text-muted-foreground">
                Apply this list internally (e.g. kitchen prep notes) without
                showing it on the storefront.
              </span>
            </div>
            <Switch
              id={`hidden-${attachment.modifierListId}`}
              checked={attachment.hiddenFromCustomerOverride}
              onCheckedChange={(v) =>
                onPatch({ hiddenFromCustomerOverride: v })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground"
              disabled={!isCustomized}
              onClick={resetAll}
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              Reset to default
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// AddModifiersDialog — checkbox list of all active modifier sets
// ============================================================================

function AddModifiersDialog({
  open,
  onOpenChange,
  available,
  attachedIds,
  onCommit,
  manageHref,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Active modifier lists only — inactive ones don't show in the picker. */
  available: ModifierListOption[];
  attachedIds: string[];
  onCommit: (nextIds: string[]) => void;
  manageHref?: string;
}) {
  const [draft, setDraft] = React.useState<Set<string>>(
    () => new Set(attachedIds),
  );

  // Re-seed whenever the dialog re-opens so toggles always reflect the
  // committed state (not whatever the merchant left half-edited last time).
  React.useEffect(() => {
    if (open) setDraft(new Set(attachedIds));
  }, [open, attachedIds]);

  function toggle(id: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDone() {
    onCommit([...draft]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0" showCloseButton={false}>
        {/* Custom header — close on the left, primary Done on the right.
            Mirrors Square's "X ... Done" layout. */}
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-full"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="size-4"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414Z"
                  clipRule="evenodd"
                />
              </svg>
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={handleDone}
            className="h-9 rounded-full px-5"
          >
            Done
          </Button>
        </div>

        <DialogHeader className="px-6">
          <DialogTitle className="text-2xl font-bold">
            Add modifiers
          </DialogTitle>
          <DialogDescription>
            Select modifier sets to apply to this item. Create new or manage
            existing sets in{" "}
            {manageHref ? (
              <Link
                href={manageHref}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Items → Modifiers
              </Link>
            ) : (
              <span className="font-medium text-foreground">
                Items → Modifiers
              </span>
            )}
            .
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pt-4 pb-6">
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active modifier sets in this catalog yet.
              {manageHref ? (
                <>
                  {" "}
                  <Link
                    href={manageHref}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Create one
                  </Link>
                  .
                </>
              ) : null}
            </p>
          ) : (
            <ScrollArea className="h-72 rounded-md border">
              <ul className="divide-y">
                {available.map((list) => {
                  const checked = draft.has(list.id);
                  const subtitle = list.modifier_type === "text"
                    ? list.max_length != null
                      ? `Text modifier: ${list.max_length} character limit`
                      : "Text modifier"
                    : list.modifiers
                        .filter((m) => m.is_active)
                        .slice(0, 3)
                        .map((m) => m.name)
                        .join(", ") || "No choices yet";
                  return (
                    <li key={list.id}>
                      <label
                        htmlFor={`add-${list.id}`}
                        className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold">
                            {list.name}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {subtitle}
                          </div>
                        </div>
                        <Checkbox
                          id={`add-${list.id}`}
                          checked={checked}
                          onCheckedChange={() => toggle(list.id)}
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </div>

        {/* Footer kept empty — header carries Close + Done. DialogFooter
            stays to preserve a11y landmark if shadcn polish lands on it. */}
        <DialogFooter className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
