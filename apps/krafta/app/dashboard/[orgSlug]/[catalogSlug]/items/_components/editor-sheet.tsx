"use client";

/**
 * editor-sheet.tsx — KRA-35 Iter 2 / T2 (revised): fullscreen bottom drawer
 * editor for the selected item.
 *
 * Replaces the v1 360px right-side Inspector with a truly fullscreen
 * bottom-slide drawer on every viewport. Earlier revision used Sheet
 * (desktop right-side) + Drawer (mobile 95dvh); merchant feedback flagged
 * the cramped feel and the semi-opaque overlay. Per the rework:
 *
 *   - Single drawer for all viewports, slides up from the bottom edge.
 *   - Fully covers the viewport (`fixed inset-0`) — no top gap, no overlay
 *     because there's nothing visible behind to dim.
 *   - Two-column form (identity left, metadata right) on lg+, stacked
 *     single column below. No `variant` prop split anymore — pure Tailwind
 *     responsive.
 *   - Buttons use the shadcn default (rounded-md). The earlier `rounded-
 *     full` pill style on Save / Actions / Cancel was inconsistent with
 *     DESIGN.md (rounded-md = buttons default per spec line 178-183).
 *   - EXPLICIT SAVE — fields are local state until merchant clicks Save.
 *   - Save state machine: idle → saving → saved (1.2s) → idle; or
 *     idle → saving → error → idle (on retry).
 *   - AlertDialog confirming "Discard changes?" when closing with dirty
 *     state. Clean close = silent.
 *   - Variations + modifier list editors are READ-ONLY placeholders in
 *     iter 2 (per Pass 7 D5B + D6A). Full editing ships in KRA-90 + KRA-85.
 *
 * Why vaul DrawerPrimitive directly (not the shadcn Drawer wrapper):
 *   shadcn's DrawerContent bakes in `mt-24` + `max-h-[80vh]` + an
 *   internal `bg-black/50` overlay + a drag handle div — all blocking
 *   true fullscreen. We bypass DrawerContent and use the vaul primitives
 *   so we can render without an overlay and without those size caps.
 *   The Inspector's old uses of shadcn Drawer are gone (T5 deleted the
 *   Inspector), so this is the only editor consumer and the divergence
 *   is local.
 *
 * Selection wiring: reads `selectedItemId` from `useCanvasSelection()`.
 * When non-null, finds the matching item in props and mounts the drawer.
 * When null, drawer stays closed. Form state is fully reset when the
 * selected item id changes via a React `key={item.id}` on EditorForm —
 * mount/unmount-driven state reset is cleaner than a giant useEffect.
 */

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Drawer as DrawerPrimitive } from "vaul";
import {
  Check,
  Copy,
  Loader2,
  MoreHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { cn } from "@/lib/utils";
import { pickLocalizedField } from "@/lib/catalogs/i18n";
import type { CatalogCategory, Item } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";

import { useCanvasSelection } from "./canvas-with-selection";
import { useCanvasLocale } from "./locale-context";
import {
  deleteItem,
  duplicateItem,
  setItemActive,
  updateItem,
} from "./actions";
import {
  VariationsEditor,
  VariationPriceInput,
  useVariationsState,
} from "./variations-editor";
import { ItemTypeSelect } from "./item-type-select";
import {
  isCatalogItemProductType,
  type CatalogItemProductType,
} from "./product-types";

// =======================================================================
// Types
// =======================================================================

type ItemTranslation = {
  id: string;
  item_id: string;
  locale: string;
  name: string;
  description: string | null;
  image_alt: string | null;
};

type ItemMedia = {
  id: string;
  item_id: string;
  bucket: string;
  storage_path: string;
  is_primary: boolean;
};

export type EditorSheetProps = {
  items: Item[];
  categories: CatalogCategory[];
  media: ItemMedia[];
  translations: ItemTranslation[];
  catalogId: string;
  catalogSlug: string;
  currencySettings: CurrencySettings;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

// =======================================================================
// EditorSheet — top-level component
// =======================================================================

export function EditorSheet({
  items,
  categories,
  media,
  translations,
  catalogId,
  catalogSlug,
  currencySettings,
}: EditorSheetProps) {
  const { selectedItemId, setSelectedItemId } = useCanvasSelection();

  const selectedItem = React.useMemo(
    () => (selectedItemId ? items.find((i) => i.id === selectedItemId) : null),
    [items, selectedItemId],
  );

  const open = selectedItem != null;

  // EditorForm registers its own `handleClose` here so backdrop / ESC /
  // built-in X close paths all route through the form's dirty-state guard
  // (shows AlertDialog before discarding work). If no form is mounted
  // yet (open=false transition), the fallback just nulls selection.
  const closeRequestRef = React.useRef<() => void>(() => setSelectedItemId(null));

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) {
        closeRequestRef.current();
      }
    },
    [],
  );

  if (!open) return null;

  const onRequestClose = () => setSelectedItemId(null);

  const registerCloseHandler = (fn: () => void) => {
    closeRequestRef.current = fn;
  };

  return (
    <DrawerPrimitive.Root
      open={open}
      onOpenChange={handleOpenChange}
      shouldScaleBackground={false}
    >
      <DrawerPrimitive.Portal>
        {/* No DrawerPrimitive.Overlay — fullscreen content covers the
            entire viewport, there's nothing behind to dim. The merchant
            feedback explicitly called out the semi-opaque overlay from
            the prior Sheet implementation. */}
        <DrawerPrimitive.Content
          data-slot="editor-fullscreen-drawer"
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-background",
            // `overflow-hidden` is REQUIRED for internal scrolling: it
            // clips any flex child that would otherwise spill past the
            // viewport. Without it, the form body grows to its content
            // size and the page itself can't scroll either (because
            // `position: fixed` doesn't participate in the document
            // scroll), so the bottom of the form gets cut off invisibly.
            "overflow-hidden",
            // Animation: slide up from bottom on open, down on close.
            // tw-animate-css utilities (imported globally in globals.css).
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            "duration-300",
            // No rounded-top — we cover the viewport edge-to-edge so any
            // curve would create a visible seam at the top of the screen.
          )}
        >
          <DrawerPrimitive.Title className="sr-only">
            Edit item: {selectedItem.name || "Untitled item"}
          </DrawerPrimitive.Title>
          <EditorForm
            key={selectedItem.id}
            item={selectedItem}
            categories={categories}
            media={media}
            translations={translations}
            catalogId={catalogId}
            catalogSlug={catalogSlug}
            currencySettings={currencySettings}
            onRequestClose={onRequestClose}
            onRegisterClose={registerCloseHandler}
          />
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}

// =======================================================================
// EditorForm — the actual form body + header chrome
// =======================================================================

type EditorFormProps = {
  item: Item;
  categories: CatalogCategory[];
  media: ItemMedia[];
  translations: ItemTranslation[];
  catalogId: string;
  catalogSlug: string;
  currencySettings: CurrencySettings;
  /** Called when the form actually wants to close (clean state or after
   *  the merchant confirms Discard in the dialog). */
  onRequestClose: () => void;
  /** Called once on mount to register the form's dirty-aware handleClose
   *  fn with the parent. The parent uses it to intercept drawer backdrop
   *  + ESC + swipe-down close paths. */
  onRegisterClose: (fn: () => void) => void;
};

function EditorForm({
  item,
  categories,
  media,
  translations,
  catalogId,
  catalogSlug,
  currencySettings,
  onRequestClose,
  onRegisterClose,
}: EditorFormProps) {
  const router = useRouter();
  const { activeLocale, defaultLocale } = useCanvasLocale();
  const { setSelectedItemId, pulseItem } = useCanvasSelection();

  // ---------------------------------------------------------------------
  // Form local state
  // ---------------------------------------------------------------------
  //
  // The form snapshot captures the merchant's editable values for the
  // ACTIVE LOCALE at sheet-open time. Switching the locale tab mid-edit
  // is rare; if it happens, the form state is NOT auto-reloaded for the
  // new locale (acceptable trade-off documented in iter2 plan Risk #5).
  //
  // Translations from other locales are passed through untouched so the
  // batched updateItem call doesn't accidentally wipe them.

  const itemTranslations = React.useMemo(
    () => translations.filter((t) => t.item_id === item.id),
    [translations, item.id],
  );

  // Locale-aware initial values via pickLocalizedField. For default-locale
  // editing, this is items.name. For non-default, this is the translation
  // row's name (or the italic fallback marker).
  const initialName = React.useMemo(
    () =>
      pickLocalizedField({
        translations: itemTranslations,
        defaults: {
          name: item.name,
          description: item.description,
          image_alt: item.image_alt,
        },
        activeLocale,
        defaultLocale,
        field: "name",
      }).value,
    [
      itemTranslations,
      item.name,
      item.description,
      item.image_alt,
      activeLocale,
      defaultLocale,
    ],
  );

  const initialDescription = React.useMemo(
    () =>
      pickLocalizedField({
        translations: itemTranslations,
        defaults: {
          name: item.name,
          description: item.description,
          image_alt: item.image_alt,
        },
        activeLocale,
        defaultLocale,
        field: "description",
      }).value,
    [
      itemTranslations,
      item.name,
      item.description,
      item.image_alt,
      activeLocale,
      defaultLocale,
    ],
  );

  const [name, setName] = React.useState(initialName);
  const [description, setDescription] = React.useState(initialDescription);
  const [categoryId, setCategoryId] = React.useState(item.category_id);
  const [isActive, setIsActive] = React.useState(item.is_active);
  const [productType, setProductType] = React.useState<CatalogItemProductType>(
    isCatalogItemProductType(item.product_type) ? item.product_type : "REGULAR",
  );

  // ---------------------------------------------------------------------
  // KRA-86 — variations state (single source of truth via the hook).
  //
  // The hook owns the LocalVariation[] state. We read state.changes here
  // to build the Save payload, state.isDirty / state.isValid to gate the
  // Save button, and state.defaultVariation to drive the top-level Price
  // field shown above this section.
  //
  // The "primary Price" pattern (mirrors Square): always show a Price
  // field; when surviving variations >= 2, mute it ("Price varies by
  // variation"). When surviving <= 1, the field IS the editor for the
  // default variation's price — it's the only price input visible.
  // ---------------------------------------------------------------------
  const { state: variationsState, dispatch: variationsDispatch } =
    useVariationsState(item.variations);

  const isDefaultLocaleEditable = activeLocale === defaultLocale;
  const hasMultipleVariations = variationsState.local.length >= 2;

  // Dirty = any field changed from its initial value.
  const isDirty =
    name !== initialName ||
    description !== initialDescription ||
    categoryId !== item.category_id ||
    isActive !== item.is_active ||
    productType !== item.product_type ||
    variationsState.isDirty;

  // ---------------------------------------------------------------------
  // Save state machine
  // ---------------------------------------------------------------------

  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const handleSave = React.useCallback(async () => {
    if (!name.trim()) {
      toast.error("Item name is required.");
      return;
    }

    setSaveStatus("saving");
    setSaveError(null);

    // Build the translations array. We touch ONLY the active locale's row
    // (or insert it if absent). All other locales pass through unchanged
    // so we don't accidentally wipe translations the merchant set earlier.
    const isDefaultLocale = activeLocale === defaultLocale;
    const otherTranslations = itemTranslations
      .filter((t) => t.locale !== activeLocale)
      .map((t) => ({
        locale: t.locale,
        name: t.name,
        description: t.description,
        image_alt: t.image_alt,
      }));
    const activeTranslation = isDefaultLocale
      ? null // default locale edits land on items.*, not item_translations
      : {
          locale: activeLocale,
          name: name.trim(),
          description: description.trim() || null,
          image_alt: itemTranslations.find((t) => t.locale === activeLocale)
            ?.image_alt ?? null,
        };

    const result = await updateItem({
      catalogId,
      catalogSlug,
      itemId: item.id,
      categoryId,
      productType,
      // For default-locale edits, top-level name/description go to items.*.
      // For non-default-locale edits, items.* stays at the canonical values
      // so we don't overwrite the source-of-truth row with a translation.
      name: isDefaultLocale ? name.trim() : item.name,
      priceCents: item.price_cents,
      description: isDefaultLocale
        ? description.trim() || null
        : item.description,
      imageAlt: item.image_alt,
      translations: activeTranslation
        ? [...otherTranslations, activeTranslation]
        : otherTranslations,
      // KRA-86 — always dispatch the full variation payload from the
      // hook. The hook is the single source of truth for variation state
      // (including the default's price set via the top-level Price
      // field). When the merchant hasn't edited anything, the payload
      // round-trips the current rows unchanged through the RPC, which
      // is idempotent.
      variationChanges: variationsState.changes,
    });

    if (!result.ok) {
      setSaveStatus("error");
      setSaveError(result.error ?? "Failed to save.");
      toast.error(result.error ?? "Failed to save.");
      return;
    }

    // Active state has its own server action (single-column UPDATE — kept
    // separate from updateItem because it can change independently and
    // doesn't need the heavier batched payload).
    if (isActive !== item.is_active) {
      const activeResult = await setItemActive({
        catalogId,
        catalogSlug,
        itemId: item.id,
        isActive,
      });
      if (!activeResult.ok) {
        setSaveStatus("error");
        setSaveError(activeResult.error ?? "Failed to update status.");
        toast.error(activeResult.error ?? "Failed to update status.");
        return;
      }
    }

    setSaveStatus("saved");
    router.refresh();
    toast.success("Item saved");
    // Auto-close the editor on success — merchant's intent ("save and
    // get out of my way") is satisfied. The toast confirms the write
    // without keeping the sheet open in a "Saved" success-state. The
    // 1.2s idle reset becomes irrelevant because the sheet unmounts.
    onRequestClose();
  }, [
    name,
    description,
    categoryId,
    isActive,
    productType,
    activeLocale,
    defaultLocale,
    itemTranslations,
    item.id,
    item.name,
    item.description,
    item.image_alt,
    item.price_cents,
    item.is_active,
    item.product_type,
    catalogId,
    catalogSlug,
    router,
    onRequestClose,
    variationsState.changes,
  ]);

  // ---------------------------------------------------------------------
  // Discard prompt
  // ---------------------------------------------------------------------

  const [discardPromptOpen, setDiscardPromptOpen] = React.useState(false);

  const handleClose = React.useCallback(() => {
    if (isDirty) {
      setDiscardPromptOpen(true);
    } else {
      onRequestClose();
    }
  }, [isDirty, onRequestClose]);

  // Register handleClose with the parent on every render so backdrop + ESC
  // close paths route through the dirty-state guard. Using useEffect not
  // useLayoutEffect because the parent's call site is event-driven (user
  // gesture), not render-coupled.
  React.useEffect(() => {
    onRegisterClose(handleClose);
  }, [handleClose, onRegisterClose]);

  const handleConfirmDiscard = React.useCallback(() => {
    setDiscardPromptOpen(false);
    onRequestClose();
  }, [onRequestClose]);

  // Delete confirmation — controlled state so the AlertDialog plays nicely
  // inside the DropdownMenu (Radix's nested behavior is finicky; lifting
  // the open state up is the documented escape).
  const [deletePromptOpen, setDeletePromptOpen] = React.useState(false);

  // ---------------------------------------------------------------------
  // Actions menu (Duplicate, Delete)
  // ---------------------------------------------------------------------

  const [isDuplicating, setIsDuplicating] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleDuplicate = React.useCallback(async () => {
    setIsDuplicating(true);
    try {
      const result = await duplicateItem({
        catalogId,
        catalogSlug,
        itemId: item.id,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Failed to duplicate item.");
        return;
      }
      toast.success("Item duplicated.");

      // Iter 2 T4 / Pass 3 D3A: post-duplicate UX — three-pronged feedback.
      //   1. Toast (above).
      //   2. setSelectedItemId(newId) → EditorSheet's selectedItem useMemo
      //      finds the clone in the (refreshed) items prop on the next
      //      render. The form re-mounts via key={item.id} with the clone's
      //      data. There's a brief flash where the sheet closes (clone not
      //      yet in items[]) and reopens (items refreshed) — acceptable
      //      because router.refresh() is fast in RSC.
      //   3. pulseItem(newId) → canvas pulses the new row + scroll-into-
      //      view after a 100ms delay (gives router.refresh time to land).
      router.refresh();
      setSelectedItemId(result.itemId);
      pulseItem(result.itemId);
    } finally {
      setIsDuplicating(false);
    }
  }, [
    catalogId,
    catalogSlug,
    item.id,
    router,
    setSelectedItemId,
    pulseItem,
  ]);

  const handleDelete = React.useCallback(async () => {
    setIsDeleting(true);
    try {
      const result = await deleteItem({
        catalogId,
        catalogSlug,
        itemId: item.id,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Failed to delete item.");
        return;
      }
      toast.success("Item deleted.");
      onRequestClose();
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  }, [catalogId, catalogSlug, item.id, router, onRequestClose]);

  // ---------------------------------------------------------------------
  // Media URLs
  // ---------------------------------------------------------------------

  const selectedMedia = React.useMemo(
    () => media.filter((m) => m.item_id === item.id),
    [media, item.id],
  );

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const mediaUrls = selectedMedia.map((m) =>
    baseUrl
      ? `${baseUrl}/storage/v1/object/public/${m.bucket}/${m.storage_path}`
      : null,
  );

  // ---------------------------------------------------------------------
  // Save button rendering
  // ---------------------------------------------------------------------

  const renderSaveButton = (className?: string) => {
    // All variants use the shadcn Button default radius (rounded-md per
    // DESIGN.md spec line 178-183). No rounded-full pills — those were
    // inconsistent with the rest of the dashboard chrome and called out
    // explicitly in merchant feedback.
    if (saveStatus === "saving") {
      return (
        <Button disabled className={className}>
          <Loader2 className="size-4 animate-spin" />
          Saving…
        </Button>
      );
    }
    if (saveStatus === "saved") {
      return (
        <Button
          disabled
          className={cn(
            "bg-emerald-600 text-white hover:bg-emerald-600",
            className,
          )}
        >
          <Check className="size-4" />
          Saved
        </Button>
      );
    }
    if (saveStatus === "error") {
      return (
        <Button onClick={handleSave} variant="destructive" className={className}>
          Save failed — Retry
        </Button>
      );
    }
    return (
      <Button
        onClick={handleSave}
        disabled={!isDirty || !variationsState.isValid}
        className={className}
      >
        Save
      </Button>
    );
  };

  // =====================================================================
  // Render
  // =====================================================================

  return (
    <>
      {/* Header — close X (left), item name (truncate, center), Actions +
          Save (right). Mirrors Square's "Edit item" pattern. */}
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-11 md:size-9"
          onClick={handleClose}
          aria-label="Close editor"
        >
          <X className="size-4" />
        </Button>

        <div className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">Editing</span>
          <h2 className="truncate text-base font-semibold tracking-tight">
            {initialName || "Untitled item"}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label="More actions"
              >
                Actions
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleDuplicate}
                disabled={isDuplicating}
              >
                <Copy className="size-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(event) => {
                  // Prevent default so the DropdownMenu doesn't auto-close
                  // before we open the AlertDialog. Then open the dialog
                  // via controlled state — cleaner than nesting an
                  // AlertDialogTrigger inside a DropdownMenuItem (Radix's
                  // nested portal handling has known race conditions).
                  event.preventDefault();
                  setDeletePromptOpen(true);
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" />
                Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Delete confirmation lives outside the DropdownMenu so it
              survives the menu closing. Controlled by deletePromptOpen
              which the Delete menu item toggles. */}
          <AlertDialog
            open={deletePromptOpen}
            onOpenChange={setDeletePromptOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                <AlertDialogDescription>
                  &ldquo;{initialName}&rdquo; will be removed permanently.
                  This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Delete item
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Save lives in the header on every viewport now — no separate
              mobile footer. Single click target consistent with Square. */}
          {renderSaveButton()}
        </div>
      </header>

      {/* Form body — scrollable. Pattern: outer div is `min-h-0 flex-1
          overflow-hidden`, ScrollArea fills it with `h-full`. The outer
          div forces the flex item to shrink below its content (default
          `min-height: auto` would let it grow indefinitely and the form
          would clip past the viewport without scrolling). ScrollArea's
          Radix Viewport then takes the constrained height and enables
          its own overflow-y: scroll. This is the documented shadcn
          idiom for scrollable content inside a flex column. */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
        <div
          className={cn(
            "mx-auto flex max-w-[1248px] gap-6 p-4 md:p-6",
            // Stack single-column on mobile / tablet, side-by-side at lg+
            // (≥ 1024px) where there's room for the right-column metadata.
            "flex-col lg:flex-row",
          )}
        >
          {/* Left column — identity fields. */}
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            {/* Item type — compact Square-style select. Trigger renders
                the icon + value inline; menu shows enabled options with
                description copy. Composed on top of shadcn Select; only
                FOOD_AND_BEV + REGULAR are surfaced (matches
                ENABLED_CATALOG_ITEM_PRODUCT_TYPES). Other types still
                live in the CreateItemFlowDialog "request feature"
                surface for discovery. */}
            <ItemTypeSelect
              value={productType}
              onValueChange={setProductType}
              disabled={!isDefaultLocaleEditable}
            />
            {!isDefaultLocaleEditable && (
              <span className="-mt-3 text-xs text-muted-foreground">
                Item type is edited on the default locale only.
              </span>
            )}

            {/* Name (required) */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="editor-name" className="text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="editor-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Item name"
                autoComplete="off"
              />
              {activeLocale !== defaultLocale && (
                <span className="text-xs text-muted-foreground">
                  Editing in{" "}
                  <span className="font-mono uppercase">{activeLocale}</span>.
                  Switch the locale tab above to edit other translations.
                </span>
              )}
            </div>

            {/* Primary Price field — Krafta mirror of Square's pattern.
                When the item has only the default variation, this IS the
                price input (the variations editor below stays collapsed
                to an "Add variation" button). When merchant adds a second
                variation, this field mutes with a hint and per-variation
                editing happens below. The "default variation" concept is
                hidden from the merchant entirely. */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium" htmlFor="editor-price">
                Price
              </Label>
              <VariationPriceInput
                valueCents={
                  variationsState.defaultVariation?.price_cents ?? 0
                }
                onChange={variationsDispatch.setDefaultPrice}
                disabled={
                  hasMultipleVariations ||
                  !isDefaultLocaleEditable ||
                  !variationsState.defaultVariation
                }
                currencySettings={currencySettings}
                className="text-left"
                data-slot="primary-price-input"
              />
              {hasMultipleVariations && (
                <span className="text-xs text-muted-foreground">
                  Price varies by variation — edit each below.
                </span>
              )}
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="editor-description"
                className="text-sm font-medium"
              >
                Description
              </Label>
              <Textarea
                id="editor-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Customer-facing description"
                rows={4}
              />
            </div>

            {/* Photos — read-only grid (upload UX deferred). */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Photos</Label>
              {mediaUrls.length === 0 ? (
                <div className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  No photos yet
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {mediaUrls.map((url, i) =>
                    url ? (
                      <div
                        key={i}
                        className="relative aspect-square w-full overflow-hidden rounded-sm bg-muted"
                      >
                        <Image
                          src={url}
                          alt=""
                          fill
                          // EditorSheet is ~800px wide on desktop / full
                          // width on mobile drawer. 3-column grid means
                          // ~250px per cell on desktop, ~120px on a 375px
                          // mobile drawer. The loader requests the closest
                          // supported width.
                          sizes="(max-width: 768px) 33vw, 250px"
                          className="object-cover"
                        />
                      </div>
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
              <span className="text-xs text-muted-foreground">
                Photo upload + reorder + primary toggle ship as a follow-up.
              </span>
            </div>

            {/* Variations — KRA-86 inline editor. Krafta compact-row
                vocabulary (not shadcn Table). When variations <= 1, shows
                only an "+ Add variation" button (the lone default's price
                is editable via the Price field above). When >= 2, shows
                the full list with per-row drag, name, price, status,
                delete. On non-default locale tabs, renders read-only with
                a banner per A6 (variation name translations are
                deferred). */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Variations</Label>
              <VariationsEditor
                state={variationsState}
                dispatch={variationsDispatch}
                currencySettings={currencySettings}
                isLocaleEditable={isDefaultLocaleEditable}
              />
            </div>

            {/* Modifier lists — placeholder. Real attach UI in KRA-85. */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Modifier lists</Label>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className="font-normal text-muted-foreground"
                >
                  No modifier lists attached
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                Attach modifier lists from{" "}
                <span className="font-medium">Items → Modifiers</span> once
                it ships (KRA-85).
              </span>
            </div>
          </div>

          {/* Right column — metadata cards. lg+: fixed 320px sidebar.
              Below lg: full-width, stacked below the left column. */}
          <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[320px]">
            <MetadataCard title="Categories">
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </MetadataCard>

            <MetadataCard title="Status">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">
                    {isActive ? "Active" : "Archived"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isActive
                      ? "Visible to customers"
                      : "Hidden from customers"}
                  </span>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </MetadataCard>

            <MetadataCard title="Locations">
              <span className="text-sm text-muted-foreground">
                All locations
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Per-location overrides ship with multi-location settings.
              </span>
            </MetadataCard>

            <MetadataCard title="Channels">
              <span className="text-sm text-muted-foreground">
                All channels
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Per-channel visibility ships with KRA-Pay.
              </span>
            </MetadataCard>
          </div>
        </div>

        {/* Save error inline display (under the form). Surfaces the toast
            content persistently so merchants who dismissed the toast can
            still see what went wrong. */}
        {saveStatus === "error" && saveError && (
          <div className="border-t bg-destructive/5 px-4 py-3 text-sm text-destructive md:px-6">
            <span className="font-medium">Save failed:</span> {saveError}
          </div>
        )}
        </ScrollArea>
      </div>

      {/* No bottom footer. The header's close-X (top-left) + Save (top-
          right) carry the cancel and commit actions on every viewport.
          Matches Square's "Edit item" pattern; one consistent click
          target instead of footer-vs-header dependency on device size. */}

      {/* Discard-changes prompt — fires when handleClose detects a dirty
          form. Cancel returns to the editor; Discard closes and loses work. */}
      <AlertDialog open={discardPromptOpen} onOpenChange={setDiscardPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits will be lost. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscard}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// =======================================================================
// MetadataCard — small wrapper for the right-column metadata cards.
// =======================================================================

function MetadataCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <Label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </Label>
      {children}
    </div>
  );
}
