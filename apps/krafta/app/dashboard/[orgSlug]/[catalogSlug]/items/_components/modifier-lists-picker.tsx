"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Plus, Settings, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * ModifierListsPicker — KRA-85 follow-up.
 *
 * Inline modifier-list attach surface for the item editor (both create
 * and edit flows). Replaces the read-only "Build and attach from
 * Items → Modifiers" placeholder that used to live in editor-sheet.tsx.
 *
 * Layout: chip-row of currently-attached lists with one-click detach,
 * plus an "Add" button that opens a shadcn `Popover` containing a
 * `Command` list of the catalog's remaining (unattached) lists. Same
 * pattern as the locale-picker uses elsewhere in the workbench.
 *
 * State model: controlled. The parent owns `attachedIds` and the
 * `onChange(nextIds)` callback. The picker is pure UI — it does NOT
 * write to the server. Persistence happens when the merchant clicks
 * Save on the editor; the new ids ride along inside the existing
 * createItem / updateItem payload.
 *
 * Inactive lists are excluded from the "Add" picker (the merchant
 * shouldn't be able to attach a soft-deleted list to a new item), but
 * any inactive list that's already attached stays visible in the chip
 * row so the merchant can spot + detach it. Square's behavior: soft-
 * deleted lists are removed from active surfaces but stay reachable
 * for cleanup.
 */

export type ModifierListOption = {
  id: string;
  name: string;
  modifier_type: "list" | "text";
  is_active: boolean;
};

export type ModifierListsPickerProps = {
  /** All modifier lists in the current catalog (active + inactive). */
  available: ModifierListOption[];
  /** Currently-attached list ids. Source of truth lives in the parent. */
  attachedIds: string[];
  /** Called with the new ids whenever the merchant attaches or detaches. */
  onChange: (nextIds: string[]) => void;
  /** Disables interaction (e.g. when the form is saving). */
  disabled?: boolean;
  /** Optional href to /items/modifiers so the merchant can jump there
   *  if the list they want doesn't exist yet. */
  manageHref?: string;
};

export function ModifierListsPicker({
  available,
  attachedIds,
  onChange,
  disabled,
  manageHref,
}: ModifierListsPickerProps) {
  const [open, setOpen] = React.useState(false);

  const byId = React.useMemo(() => {
    const map = new Map<string, ModifierListOption>();
    for (const l of available) map.set(l.id, l);
    return map;
  }, [available]);

  // Chip row pulls from attachedIds so the order reflects what the
  // merchant set; a list that's been deleted entirely from the catalog
  // would drop out of `byId` and we gracefully skip it.
  const attachedChips = React.useMemo(
    () =>
      attachedIds
        .map((id) => byId.get(id))
        .filter((l): l is ModifierListOption => Boolean(l)),
    [attachedIds, byId],
  );

  // "Add" popover only offers active lists that aren't already attached.
  // Active filter mirrors Square's soft-delete semantics — a disabled
  // list is hidden from new-attach paths but can still be seen on rows
  // it was attached to before going inactive.
  const attachableSet = React.useMemo(
    () => new Set(attachedIds),
    [attachedIds],
  );
  const addCandidates = React.useMemo(
    () =>
      available.filter((l) => l.is_active && !attachableSet.has(l.id)),
    [available, attachableSet],
  );

  function attach(id: string) {
    if (attachableSet.has(id)) return;
    onChange([...attachedIds, id]);
    setOpen(false);
  }

  function detach(id: string) {
    onChange(attachedIds.filter((existing) => existing !== id));
  }

  // Empty state — catalog has zero modifier lists. Direct the merchant
  // to the Modifiers page rather than rendering a useless picker.
  if (available.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">
          No modifier lists in this catalog yet.{" "}
          {manageHref ? (
            <Link
              href={manageHref}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Create one
            </Link>
          ) : (
            <span className="font-medium text-foreground">
              Items → Modifiers
            </span>
          )}{" "}
          first, then come back to attach it.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {attachedChips.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          No modifier lists attached.
        </span>
      ) : (
        attachedChips.map((list) => (
          <AttachedChip
            key={list.id}
            list={list}
            onDetach={() => detach(list.id)}
            disabled={disabled}
          />
        ))
      )}

      {/* modal lives on Popover root (not PopoverContent) — defeats
          parent Drawer/Dialog focus trap so the Command list scrolls
          and search works inside the drawer-mounted editor sheet. */}
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || addCandidates.length === 0}
            className="h-7 gap-1.5 text-xs font-normal"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {addCandidates.length === 0
              ? "All lists attached"
              : "Add modifier list"}
            <ChevronDown
              className="size-3 text-muted-foreground"
              aria-hidden="true"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search lists…" />
            <CommandList>
              <CommandEmpty>No matching lists.</CommandEmpty>
              {addCandidates.length > 0 && (
                <CommandGroup heading="Attach">
                  {addCandidates.map((list) => (
                    <CommandItem
                      key={list.id}
                      value={list.name}
                      onSelect={() => attach(list.id)}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{list.name}</span>
                      <Badge
                        variant="secondary"
                        className="ml-2 font-mono text-[10px] uppercase tracking-wide"
                      >
                        {list.modifier_type === "text" ? "Text" : "List"}
                      </Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {manageHref && (
                <CommandGroup heading="Manage">
                  <CommandItem
                    value="__manage"
                    onSelect={() => setOpen(false)}
                    className="text-xs text-muted-foreground"
                    asChild
                  >
                    <Link href={manageHref}>
                      <Settings className="size-3.5" aria-hidden="true" />
                      Open Items → Modifiers
                    </Link>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ============================================================================
// AttachedChip — single attached-list badge with detach button
// ============================================================================

function AttachedChip({
  list,
  onDetach,
  disabled,
}: {
  list: ModifierListOption;
  onDetach: () => void;
  disabled?: boolean;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1.5 pr-1 text-xs font-normal",
        !list.is_active && "opacity-60 line-through",
      )}
      title={
        list.is_active
          ? `${list.name} (${list.modifier_type})`
          : `${list.name} — inactive`
      }
    >
      <span className="truncate">{list.name}</span>
      <button
        type="button"
        onClick={onDetach}
        disabled={disabled}
        aria-label={`Detach ${list.name}`}
        className="rounded-sm text-muted-foreground hover:bg-background hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </Badge>
  );
}
