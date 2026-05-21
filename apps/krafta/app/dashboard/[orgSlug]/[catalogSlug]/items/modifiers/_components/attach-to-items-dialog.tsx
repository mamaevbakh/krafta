"use client";

import * as React from "react";
import { Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

import { attachModifierListToItems } from "./actions";
import type {
  ModifierListItemOption,
  ModifierListRow,
} from "./modifiers-panel";

/**
 * AttachToItemsDialog — multi-select item picker.
 *
 * Two zones: top half shows items already attached (with one-click detach),
 * bottom half is the searchable picker for items NOT yet attached. Keeps
 * cognitive load low — the merchant sees current state before changing it.
 *
 * Per the ticket scope: bulk attach via `attachModifierListToItems` upserts
 * one row per (item × list) pair. The DB's PK on (item_id, modifier_list_id)
 * dedupes; the action's `onConflict: "item_id,modifier_list_id"` means
 * re-attaching is a no-op rather than an error.
 *
 * The `attachedItemIds` prop is the source of truth for what's currently
 * attached — passed from the panel which computed it from the
 * item_modifier_lists snapshot. Detach goes through the panel's
 * `onDetachItem` so the local state stays in sync after `router.refresh()`.
 */
export function AttachToItemsDialog({
  open,
  catalogId,
  catalogSlug,
  list,
  items,
  attachedItemIds,
  onOpenChange,
  onAttached,
  onDetachItem,
}: {
  open: boolean;
  catalogId: string;
  catalogSlug: string;
  list: ModifierListRow | null;
  items: ModifierListItemOption[];
  attachedItemIds: Set<string>;
  onOpenChange: (open: boolean) => void;
  onAttached: () => void;
  onDetachItem: (listId: string, itemId: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);

  // Reset selection + query whenever the dialog opens for a different list.
  React.useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setQuery("");
  }, [open, list?.id]);

  const attached = React.useMemo(
    () => items.filter((i) => attachedItemIds.has(i.id)),
    [items, attachedItemIds],
  );

  const available = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = items.filter((i) => !attachedItemIds.has(i.id));
    if (!q) return base;
    return base.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, attachedItemIds, query]);

  function toggle(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const allVisible = available.every((i) => prev.has(i.id));
      const next = new Set(prev);
      if (allVisible) {
        for (const i of available) next.delete(i.id);
      } else {
        for (const i of available) next.add(i.id);
      }
      return next;
    });
  }

  async function handleAttach() {
    if (!list || selected.size === 0) return;
    setSubmitting(true);
    const result = await attachModifierListToItems({
      catalogId,
      catalogSlug,
      modifierListId: list.id,
      itemIds: [...selected],
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `Attached to ${selected.size} item${selected.size === 1 ? "" : "s"}.`,
    );
    onAttached();
  }

  const allVisibleSelected =
    available.length > 0 && available.every((i) => selected.has(i.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Attach {list?.name ? `"${list.name}"` : "list"} to items
          </DialogTitle>
          <DialogDescription>
            Customers will see this list at checkout on every item it&apos;s
            attached to.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Currently attached */}
          {attached.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Currently attached ({attached.length})
              </h3>
              <ScrollArea className="max-h-32 rounded-md border">
                <div className="flex flex-wrap gap-1.5 p-2">
                  {attached.map((item) => (
                    <Badge
                      key={item.id}
                      variant="secondary"
                      className="gap-1 pr-1"
                    >
                      {item.name}
                      <button
                        type="button"
                        onClick={() => {
                          if (list) onDetachItem(list.id, item.id);
                        }}
                        className="rounded-sm text-muted-foreground hover:bg-background hover:text-destructive"
                        aria-label={`Detach ${item.name}`}
                      >
                        <X className="size-3" aria-hidden="true" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </ScrollArea>
            </section>
          )}

          {/* Picker */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Add to more items
              </h3>
              {available.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={toggleAllVisible}
                >
                  {allVisibleSelected ? "Clear" : "Select all visible"}
                </Button>
              )}
            </div>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search items…"
                className="h-9 pl-8"
              />
            </div>

            <ScrollArea className="h-72 rounded-md border">
              {available.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {query
                    ? "No matches."
                    : items.length === 0
                      ? "This catalog has no items yet."
                      : "Every item already has this list attached."}
                </div>
              ) : (
                <ul className="flex flex-col">
                  {available.map((item) => {
                    const checked = selected.has(item.id);
                    return (
                      <li key={item.id}>
                        <label
                          className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40"
                          htmlFor={`attach-${item.id}`}
                        >
                          <Checkbox
                            id={`attach-${item.id}`}
                            checked={checked}
                            onCheckedChange={() => toggle(item.id)}
                          />
                          <span className="text-sm">{item.name}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </section>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={handleAttach}
            disabled={submitting || selected.size === 0}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Attaching…
              </>
            ) : selected.size === 0 ? (
              "Attach"
            ) : (
              `Attach to ${selected.size} item${selected.size === 1 ? "" : "s"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
