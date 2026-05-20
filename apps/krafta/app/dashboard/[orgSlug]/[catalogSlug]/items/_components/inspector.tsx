"use client";

/**
 * inspector.tsx — Library Canvas right-side / mobile bottom-sheet inspector.
 *
 * Renders for the currently-selected item. Per DR1 field order:
 *   1. Variations table
 *   2. Modifier lists
 *   3. Photos
 *   4. Status (read-only in PR 2; toggle ships PR 3 with a new server action)
 *   5. Actions menu (Duplicate, Delete)
 *
 * Layout:
 *   - Desktop (>= 768px): sticky right-side panel, ~360px wide
 *   - Mobile (< 768px): shadcn Drawer (vaul) at ~75% snap height per DR2
 *
 * PR 2 scope is intentionally minimal — display the data already loaded
 * at page level (item.price_cents, media[]); placeholders for surfaces
 * that need more wiring (variations editor table, modifier-list combobox,
 * photo upload). PR 3 fills in the inline-edit affordances + locale-tab-
 * aware editing; KRA-85 fills in the full modifier-list management.
 *
 * The inspector reads selection from `useCanvasSelection()` and finds the
 * matching item in the props array. Closing the inspector deselects
 * (setSelectedItemId(null)).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, MoreHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import type { Item } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { cn } from "@/lib/utils";

import { useCanvasSelection } from "./canvas-with-selection";
import { deleteItem, duplicateItem, setItemActive } from "./actions";

type ItemMedia = {
  id: string;
  item_id: string;
  bucket: string;
  storage_path: string;
  is_primary: boolean;
};

export type InspectorProps = {
  items: Item[];
  media: ItemMedia[];
  catalogId: string;
  catalogSlug: string;
  currencySettings: CurrencySettings;
};

/**
 * Inspector — single component handling both desktop and mobile rendering.
 *
 * Decision: render the content tree once, switch the OUTER chrome on
 * viewport (CSS `md:` classes for desktop visibility, Drawer for mobile).
 * Tailwind's responsive classes make this a one-place check; no media
 * query JS, no SSR hydration mismatch.
 */
export function Inspector({
  items,
  media,
  catalogId,
  catalogSlug,
  currencySettings,
}: InspectorProps) {
  const { selectedItemId, setSelectedItemId } = useCanvasSelection();
  const router = useRouter();
  const [isDuplicating, setIsDuplicating] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const selectedItem = React.useMemo(
    () => (selectedItemId ? items.find((i) => i.id === selectedItemId) : null),
    [items, selectedItemId],
  );

  const selectedMedia = React.useMemo(
    () => (selectedItem ? media.filter((m) => m.item_id === selectedItem.id) : []),
    [media, selectedItem],
  );

  const handleClose = React.useCallback(() => {
    setSelectedItemId(null);
  }, [setSelectedItemId]);

  const handleDuplicate = React.useCallback(async () => {
    if (!selectedItem) return;
    setIsDuplicating(true);
    try {
      const result = await duplicateItem({
        catalogId,
        catalogSlug,
        itemId: selectedItem.id,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Failed to duplicate item.");
        return;
      }
      toast.success("Item duplicated.");
      // Select the new clone so the merchant sees it in the inspector.
      setSelectedItemId(result.itemId);
      router.refresh();
    } finally {
      setIsDuplicating(false);
    }
  }, [selectedItem, catalogId, catalogSlug, router, setSelectedItemId]);

  const handleDelete = React.useCallback(async () => {
    if (!selectedItem) return;
    setIsDeleting(true);
    try {
      const result = await deleteItem({
        catalogId,
        catalogSlug,
        itemId: selectedItem.id,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Failed to delete item.");
        return;
      }
      toast.success("Item deleted.");
      setSelectedItemId(null);
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  }, [selectedItem, catalogId, catalogSlug, router, setSelectedItemId]);

  // Status toggle handler must be declared BEFORE the early return so
  // React Hooks rules are respected (every render must call hooks in the
  // same order; an early return between hooks violates that).
  const handleSetActive = React.useCallback(
    async (isActive: boolean) => {
      if (!selectedItem) return;
      const result = await setItemActive({
        catalogId,
        catalogSlug,
        itemId: selectedItem.id,
        isActive,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Failed to update status.");
        return;
      }
      toast.success(isActive ? "Item active." : "Item archived.");
      router.refresh();
    },
    [selectedItem, catalogId, catalogSlug, router],
  );

  if (!selectedItem) return null;

  // Compute media URLs once for the body. Storage objects live under
  // `public-assets/{storage_path}` per the existing pattern in
  // /api/items/media.
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const mediaUrls = selectedMedia.map((m) =>
    baseUrl
      ? `${baseUrl}/storage/v1/object/public/${m.bucket}/${m.storage_path}`
      : null,
  );

  const body = (
    <InspectorBody
      item={selectedItem}
      mediaUrls={mediaUrls}
      currencySettings={currencySettings}
      isDuplicating={isDuplicating}
      isDeleting={isDeleting}
      onDuplicate={handleDuplicate}
      onDelete={handleDelete}
      onSetActive={handleSetActive}
      onClose={handleClose}
    />
  );

  return (
    <>
      {/* Desktop: sticky side panel, visible at md+. */}
      <aside
        data-slot="inspector-desktop"
        className={cn(
          "hidden md:block",
          "sticky top-0 h-[calc(100vh-4rem)] w-[360px] shrink-0",
          "border-l bg-background",
        )}
      >
        <ScrollArea className="h-full">{body}</ScrollArea>
      </aside>

      {/* Mobile: shadcn Drawer (vaul) at 75% snap per DR2. */}
      <Drawer
        open={true}
        onOpenChange={(next) => {
          if (!next) handleClose();
        }}
        // Non-modal so the canvas stays visible behind per DR2. vaul's
        // default modal=true; we override to keep the merchant's spatial
        // context.
        modal={false}
      >
        <DrawerContent
          data-slot="inspector-mobile"
          className="md:hidden h-[75dvh] max-h-[75dvh] focus:outline-none"
        >
          {/* Hidden header for accessibility — Drawer requires a DrawerTitle
              somewhere in its tree. The visible header lives inside the body. */}
          <DrawerHeader className="sr-only">
            <DrawerTitle>{selectedItem.name}</DrawerTitle>
          </DrawerHeader>
          <ScrollArea className="flex-1">{body}</ScrollArea>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/**
 * InspectorBody — shared content for desktop side panel + mobile Drawer.
 *
 * Field order per DR1: variations first (highest-frequency edit for cafe
 * merchants), then modifier lists, then photos, then status, then the
 * actions dropdown menu.
 */
function InspectorBody({
  item,
  mediaUrls,
  currencySettings,
  isDuplicating,
  isDeleting,
  onDuplicate,
  onDelete,
  onSetActive,
  onClose,
}: {
  item: Item;
  mediaUrls: (string | null)[];
  currencySettings: CurrencySettings;
  isDuplicating: boolean;
  isDeleting: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetActive: (next: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-5">
      {/* Header: item name + close button + actions menu. */}
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-xs text-muted-foreground">Editing</span>
          <h3 className="truncate text-base font-semibold">
            {item.name || "Untitled item"}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                // Mobile-first touch target ≥ 44px per DESIGN.md Forms rule.
                // Desktop chrome stays compact at 32px since pointer precision
                // is finer there.
                className="size-11 md:size-8"
                aria-label="More actions"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={onDuplicate}
                disabled={isDuplicating}
              >
                <Copy className="size-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(event) => event.preventDefault()}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    Delete…
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                    <AlertDialogDescription>
                      &ldquo;{item.name}&rdquo; will be removed permanently. This
                      cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onDelete}
                      disabled={isDeleting}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      Delete item
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            // Same mobile ≥ 44px / desktop 32px split as the actions trigger
            // above — see comment there for rationale.
            className="size-11 md:size-8"
            onClick={onClose}
            aria-label="Close inspector"
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>

      <Separator />

      {/* 1. Variations (default-first per DR1). PR 2 shows the default
          variation's price; PR 3 wires the full Variations Table with
          inline-edit InlineCurrency rows. */}
      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Variations
        </h4>
        <div className="rounded-md border">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-sm font-medium">Default</span>
            <span className="font-mono tabular-nums text-sm font-semibold">
              {formatPriceCents(item.price_cents, currencySettings)}
            </span>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Additional variations (sizes, options) ship in the next release.
        </p>
      </section>

      {/* 2. Modifier lists. PR 2 placeholder; KRA-85 ships full CRUD +
          inline attach combobox. */}
      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Modifier lists
        </h4>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="font-normal text-muted-foreground">
            No modifier lists attached
          </Badge>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Attach modifier lists from{" "}
          <span className="font-medium">Items → Modifiers</span> once it
          ships.
        </p>
      </section>

      {/* 3. Photos. Display-only grid for PR 2. PR 3 / follow-up wires
          upload + reorder + primary toggle. */}
      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Photos
        </h4>
        {mediaUrls.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            No photos yet
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {mediaUrls.map((url, i) =>
              url ? (
                // Use plain <img> in the inspector grid for layout
                // simplicity (next/image needs explicit dimensions or
                // fill+sized container; the inspector's grid cells are
                // small enough that the unoptimized path is fine for v1).
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={url}
                  alt=""
                  className="aspect-square w-full rounded-sm object-cover"
                />
              ) : (
                <div
                  key={i}
                  className="aspect-square w-full rounded-sm bg-muted"
                  aria-hidden
                />
              ),
            )}
          </div>
        )}
      </section>

      {/* 4. Status. PR 3 wires the toggle via setItemActive (lightweight
          single-column UPDATE instead of the full updateItem round-trip). */}
      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Status
        </h4>
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <Label htmlFor="inspector-status" className="cursor-pointer">
            <span className="text-sm font-medium">
              {item.is_active ? "Active" : "Archived"}
            </span>
            <span className="block text-xs text-muted-foreground">
              {item.is_active
                ? "Visible to customers"
                : "Hidden from customers"}
            </span>
          </Label>
          <Switch
            id="inspector-status"
            checked={item.is_active}
            onCheckedChange={onSetActive}
          />
        </div>
      </section>
    </div>
  );
}
