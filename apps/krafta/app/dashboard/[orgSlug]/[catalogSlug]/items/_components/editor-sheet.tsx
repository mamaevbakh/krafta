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
import { useRouter, usePathname } from "next/navigation";
import { Drawer as DrawerPrimitive } from "vaul";
import {
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
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
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
import { slugify } from "@/lib/catalogs/slug";
import type { CatalogCategory, Item } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { useT } from "@/lib/locales/dashboard/context";

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
import { PhotoUploader } from "./photo-uploader";
import { DraftEditorForm } from "./draft-editor-form";
import { AdvancedSection } from "./advanced-section";
import {
  ModifierListsAttachment,
  type ModifierAttachment,
} from "./modifier-lists-attachment";
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
  /** KRA-85 follow-up — full modifier-list set for the catalog (with
   *  nested choices + min/max defaults), drives the Square-inspired
   *  attachment UI inside the editor. */
  modifierLists: Array<{
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
  }>;
  /** KRA-85 follow-up — current (item × list) attachments with per-item
   *  override columns. Editor derives the row attachments by filtering
   *  on the selected item's id. */
  itemModifierLists: Array<{
    item_id: string;
    modifier_list_id: string;
    ordinal: number;
    min_selected_override: number | null;
    max_selected_override: number | null;
    hidden_from_customer_override: boolean;
  }>;
  orgId: string;
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
  modifierLists,
  itemModifierLists,
  orgId,
  catalogId,
  catalogSlug,
  currencySettings,
}: EditorSheetProps) {
  const t = useT();
  const {
    selectedItemId,
    setSelectedItemId,
    creatingForCategoryId,
    cancelCreating,
  } = useCanvasSelection();

  const selectedItem = React.useMemo(
    () => (selectedItemId ? items.find((i) => i.id === selectedItemId) : null),
    [items, selectedItemId],
  );

  // The drawer is open when EITHER an item is selected for editing OR
  // a create draft is in flight for some category. Mutually exclusive
  // per the context — setting one clears the other.
  const isCreating = creatingForCategoryId !== null;
  const open = selectedItem != null || isCreating;

  // EditorForm + DraftEditorForm both register their own dirty-aware
  // close handler here so backdrop / ESC / built-in X close paths all
  // route through the form's discard prompt. Fallback (before either
  // form mounts) is a plain selection clear.
  const closeRequestRef = React.useRef<() => void>(() => {
    setSelectedItemId(null);
    cancelCreating();
  });

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) {
        closeRequestRef.current();
      }
    },
    [],
  );

  // Body scroll lock — while the editor is open, freeze the page
  // underneath so:
  //   (a) Scrolling on the header area (no inner scroller above the
  //       <ScrollArea>) doesn't fall through to the canvas.
  //   (b) Overscroll at the form's top/bottom doesn't expose the page.
  // Defense-in-depth: vaul DOES apply its own body lock, but the
  // shouldScaleBackground={false} code path skips parts of the lock
  // setup, so we re-apply explicitly. Cleanup restores the prior
  // overflow value so other consumers (modals, popovers) aren't broken
  // if they nested around us.
  React.useEffect(() => {
    if (!open) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [open]);

  if (!open) return null;

  // Close routes — edit clears selectedItemId, create clears the
  // creatingForCategoryId. The wrapper picks the right one based on
  // which mode is active.
  const onRequestClose = () => {
    if (isCreating) cancelCreating();
    else setSelectedItemId(null);
  };

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
          {isCreating ? (
            <>
              <DrawerPrimitive.Title className="sr-only">
                {t("items.create_new_item")}
              </DrawerPrimitive.Title>
              <DraftEditorForm
                key={`draft-${creatingForCategoryId}`}
                initialCategoryId={creatingForCategoryId!}
                categories={categories}
                modifierLists={modifierLists}
                orgId={orgId}
                catalogId={catalogId}
                catalogSlug={catalogSlug}
                currencySettings={currencySettings}
                onRequestClose={onRequestClose}
                onRegisterClose={registerCloseHandler}
              />
            </>
          ) : (
            selectedItem && (
              <>
                <DrawerPrimitive.Title className="sr-only">
                  {t("items.edit_item_title", {
                    name: selectedItem.name || t("items.untitled_item"),
                  })}
                </DrawerPrimitive.Title>
                <EditorForm
                  key={selectedItem.id}
                  item={selectedItem}
                  categories={categories}
                  media={media}
                  translations={translations}
                  modifierLists={modifierLists}
                  itemModifierLists={itemModifierLists}
                  orgId={orgId}
                  catalogId={catalogId}
                  catalogSlug={catalogSlug}
                  currencySettings={currencySettings}
                  onRequestClose={onRequestClose}
                  onRegisterClose={registerCloseHandler}
                />
              </>
            )
          )}
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
  modifierLists: Array<{
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
  }>;
  itemModifierLists: Array<{
    item_id: string;
    modifier_list_id: string;
    ordinal: number;
    min_selected_override: number | null;
    max_selected_override: number | null;
    hidden_from_customer_override: boolean;
  }>;
  orgId: string;
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
  modifierLists,
  itemModifierLists,
  orgId,
  catalogId,
  catalogSlug,
  currencySettings,
  onRequestClose,
  onRegisterClose,
}: EditorFormProps) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  // Derive /items/modifiers from the current path so we don't have to
  // thread orgSlug through every consumer just to build one link. The
  // form only mounts under /dashboard/[orgSlug]/[catalogSlug]/items*
  // so the prefix is always present.
  const modifiersManageHref = React.useMemo(() => {
    const match = pathname?.match(
      /^(\/dashboard\/[^/]+\/[^/]+)\/items(?:\/.*)?$/,
    );
    return match ? `${match[1]}/items/modifiers` : "/dashboard";
  }, [pathname]);
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
  /** Slug seed = current items.slug. Merchant can edit; if they clear
   *  it, updateItem regenerates from `name` server-side. */
  const [slug, setSlug] = React.useState(item.slug);

  // ---------------------------------------------------------------------
  // KRA-85 follow-up — modifier-list attachment state with per-item
  // overrides (min/max/hidden) + ordinal. Square-inspired UX: the
  // attachment component owns the row reordering + per-row settings
  // popover; we just round-trip the changeset through Save.
  // ---------------------------------------------------------------------
  const initialAttachments = React.useMemo<ModifierAttachment[]>(
    () =>
      itemModifierLists
        .filter((pair) => pair.item_id === item.id)
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((pair) => ({
          modifierListId: pair.modifier_list_id,
          ordinal: pair.ordinal,
          minSelectedOverride: pair.min_selected_override,
          maxSelectedOverride: pair.max_selected_override,
          hiddenFromCustomerOverride: pair.hidden_from_customer_override,
        })),
    [itemModifierLists, item.id],
  );
  const [modifierAttachments, setModifierAttachments] = React.useState<
    ModifierAttachment[]
  >(initialAttachments);

  // Re-seed if the underlying snapshot changes (RSC refresh, item swap).
  React.useEffect(() => {
    setModifierAttachments(initialAttachments);
  }, [initialAttachments]);

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

  // Dirty = any field changed from its initial value. Modifier attachments
  // serialize cheaply enough that JSON diff is the clearest test —
  // catches reordering, per-row override edits, and add/remove all at once.
  const modifierAttachmentsDirty = React.useMemo(
    () =>
      JSON.stringify(modifierAttachments) !==
      JSON.stringify(initialAttachments),
    [modifierAttachments, initialAttachments],
  );

  const isDirty =
    name !== initialName ||
    description !== initialDescription ||
    categoryId !== item.category_id ||
    isActive !== item.is_active ||
    productType !== item.product_type ||
    slug !== item.slug ||
    variationsState.isDirty ||
    modifierAttachmentsDirty;

  // ---------------------------------------------------------------------
  // Save state machine
  // ---------------------------------------------------------------------

  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const handleSave = React.useCallback(async () => {
    if (!name.trim()) {
      toast.error(t("items.name_required"));
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
      // Slug edits land on items.slug regardless of locale (URLs are
      // global). Empty string triggers updateItem's "regenerate from
      // name" fallback. Non-default-locale edits don't change the slug
      // so we send the existing value untouched.
      slug: isDefaultLocale ? slug.trim() : item.slug,
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
      // KRA-85 follow-up — full modifier-list attachment set after this
      // save. Each entry carries ordinal + per-item overrides; the server
      // replaces item_modifier_lists row set in one pass.
      modifierAttachments,
    });

    if (!result.ok) {
      setSaveStatus("error");
      setSaveError(result.error ?? t("items.save_failed"));
      toast.error(result.error ?? t("items.save_failed"));
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
        setSaveError(activeResult.error ?? t("items.status_update_failed"));
        toast.error(activeResult.error ?? t("items.status_update_failed"));
        return;
      }
    }

    setSaveStatus("saved");
    router.refresh();
    toast.success(t("items.item_saved"));
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
    slug,
    activeLocale,
    defaultLocale,
    itemTranslations,
    item.id,
    item.name,
    item.slug,
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
    modifierAttachments,
    t,
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
        toast.error(result.error ?? t("items.duplicate_failed"));
        return;
      }
      toast.success(t("items.item_duplicated"));

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
    t,
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
        toast.error(result.error ?? t("items.delete_failed"));
        return;
      }
      toast.success(t("items.item_deleted"));
      // Close the prompt explicitly. We used to rely on the
      // AlertDialogAction's built-in close behavior, but when the form
      // unmounts (selectedItemId → null) before the dialog finishes
      // closing, the next render path could leave the dialog state in
      // an inconsistent place. Explicit close first, then unmount.
      setDeletePromptOpen(false);
      onRequestClose();
      router.refresh();
    } catch (err) {
      // Defense in depth — server actions can throw on
      // network/serialization errors that don't go through the
      // result-object error path. Surface them as a toast so the
      // merchant knows the delete didn't land.
      const message =
        err instanceof Error ? err.message : t("items.delete_failed");
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  }, [catalogId, catalogSlug, item.id, router, onRequestClose, t]);

  // ---------------------------------------------------------------------
  // Media URLs
  // ---------------------------------------------------------------------

  const selectedMedia = React.useMemo(
    () => media.filter((m) => m.item_id === item.id),
    [media, item.id],
  );

  // ---------------------------------------------------------------------
  // Save button rendering
  // ---------------------------------------------------------------------

  const renderSaveButton = (className?: string) => {
    // All Save button states use the default Button color — success
    // signaling lives in the toast, not in the button itself. We auto-
    // close the sheet on success so the "Saved" state is never visible
    // anyway; the error state stays as a plain Retry button.
    if (saveStatus === "saving") {
      return (
        <Button disabled className={className}>
          <Loader2 className="size-4 animate-spin" />
          {t("common.saving")}
        </Button>
      );
    }
    if (saveStatus === "error") {
      return (
        <Button onClick={handleSave} className={className}>
          {t("items.save_failed_retry")}
        </Button>
      );
    }
    return (
      <Button
        onClick={handleSave}
        disabled={!isDirty || !variationsState.isValid}
        className={className}
      >
        {t("common.save")}
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
          aria-label={t("items.close_editor")}
        >
          <X className="size-4" />
        </Button>

        <div className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">{t("items.editing")}</span>
          <h2 className="truncate text-base font-semibold tracking-tight">
            {initialName || t("items.untitled_item")}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label={t("items.more_actions")}
              >
                {t("items.actions")}
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleDuplicate}
                disabled={isDuplicating}
              >
                <Copy className="size-4" />
                {t("common.duplicate")}
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
                <AlertDialogTitle>{t("items.delete_item_title")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("items.delete_item_description", { name: initialName })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>
                  {t("common.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {t("items.delete_item_action")}
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
        {/* `overscroll-contain` on the Viewport prevents scroll chaining
            when the form hits top/bottom — without it, reaching the end
            of the form bleeds through to the page underneath via the
            browser's default overscroll behavior. Targets the Viewport
            because that's the element doing the scrolling. */}
        <ScrollArea className="h-full [&>[data-slot=scroll-area-viewport]]:overscroll-contain">
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
            {/* Item type — shadcn Select wrapped in Field for consistent
                form chrome. Two options surfaced (FOOD_AND_BEV +
                REGULAR); other product types stay deferred per
                ENABLED_CATALOG_ITEM_PRODUCT_TYPES in product-types.ts. */}
            <Field>
              <FieldLabel htmlFor="editor-item-type">{t("items.item_type")}</FieldLabel>
              <ItemTypeSelect
                id="editor-item-type"
                value={productType}
                onValueChange={setProductType}
                disabled={!isDefaultLocaleEditable}
              />
              {!isDefaultLocaleEditable && (
                <FieldDescription>
                  {t("items.item_type_default_only")}
                </FieldDescription>
              )}
            </Field>

            {/* Name (required) */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="editor-name" className="text-sm font-medium">
                {t("items.field_name")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="editor-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("items.name_placeholder")}
                autoComplete="off"
              />
              {activeLocale !== defaultLocale && (
                <span className="text-xs text-muted-foreground">
                  {t("items.editing_in_locale", {
                    locale: activeLocale.toUpperCase(),
                  })}
                </span>
              )}
            </div>

            {/* Primary Price field — Krafta mirror of Square's pattern.
                When the item has only the default variation, this IS the
                price input (the variations editor below stays collapsed
                to an "Add variation" button). When merchant adds a second
                variation, this field mutes (Field data-disabled + Input
                disabled per shadcn forms rule) with a hint and per-
                variation editing happens below. The "default variation"
                concept is hidden from the merchant entirely. */}
            <Field
              data-disabled={
                hasMultipleVariations ||
                !isDefaultLocaleEditable ||
                !variationsState.defaultVariation
                  ? true
                  : undefined
              }
            >
              <FieldLabel htmlFor="editor-price">{t("items.price")}</FieldLabel>
              <VariationPriceInput
                id="editor-price"
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
                <FieldDescription>
                  {t("items.price_varies")}
                </FieldDescription>
              )}
            </Field>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="editor-description"
                className="text-sm font-medium"
              >
                {t("items.field_description")}
              </Label>
              <Textarea
                id="editor-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("items.description_placeholder")}
                rows={4}
              />
            </div>

            {/* Photos — KRA-88 Slice 1: upload + display + delete. Reorder
                and primary-toggle ship in Slice 2. Empty state uses shadcn
                Empty with an upload button; populated state shows a grid
                with a trailing "+ Add photo" tile. */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">{t("items.photos")}</Label>
              <PhotoUploader
                itemId={item.id}
                orgId={orgId}
                catalogId={catalogId}
                media={selectedMedia}
              />
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
              <Label className="text-sm font-medium">{t("items.variations")}</Label>
              <VariationsEditor
                state={variationsState}
                dispatch={variationsDispatch}
                currencySettings={currencySettings}
                isLocaleEditable={isDefaultLocaleEditable}
              />
            </div>

            {/* Square-inspired modifier attachments. Component owns its
                own header ("Modifiers" + Edit button) + rows. Save flushes
                via updateItem.modifierAttachments which carries ordinal +
                per-item overrides on top of the set membership. */}
            <ModifierListsAttachment
              available={modifierLists}
              attachments={modifierAttachments}
              onChange={setModifierAttachments}
              disabled={saveStatus === "saving"}
              manageHref={modifiersManageHref}
            />

            {/* Advanced — collapsible power-user knobs. Currently just
                the Slug field; future ones (custom metadata, SKU when
                that ships, etc.) belong here too. Default collapsed —
                most merchants never touch slug. */}
            <AdvancedSection
              slug={slug}
              onSlugChange={setSlug}
              disabled={!isDefaultLocaleEditable}
              idPrefix="editor"
            />
          </div>

          {/* Right column — metadata cards. lg+: fixed 320px sidebar.
              Below lg: full-width, stacked below the left column. */}
          <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[320px]">
            <MetadataCard title={t("items.categories")}>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("items.select_category")} />
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

            <MetadataCard title={t("items.status")}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">
                    {isActive ? t("items.status_active") : t("items.status_archived")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isActive
                      ? t("items.visible_to_customers")
                      : t("items.hidden_from_customers")}
                  </span>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </MetadataCard>

            <MetadataCard title={t("items.locations")}>
              <span className="text-sm text-muted-foreground">
                {t("items.locations_all")}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t("items.locations_hint")}
              </span>
            </MetadataCard>

            <MetadataCard title={t("items.channels")}>
              <span className="text-sm text-muted-foreground">
                {t("items.channels_all")}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t("items.channels_hint")}
              </span>
            </MetadataCard>
          </div>
        </div>

        {/* Save error inline display (under the form). Surfaces the toast
            content persistently so merchants who dismissed the toast can
            still see what went wrong. */}
        {saveStatus === "error" && saveError && (
          <div className="border-t bg-destructive/5 px-4 py-3 text-sm text-destructive md:px-6">
            <span className="font-medium">{t("items.save_failed_inline")}</span> {saveError}
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
            <AlertDialogTitle>{t("items.discard_changes_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("items.discard_changes_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("items.keep_editing")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard}>
              {t("common.discard")}
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
