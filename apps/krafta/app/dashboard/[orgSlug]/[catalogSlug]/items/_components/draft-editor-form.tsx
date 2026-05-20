"use client";

/**
 * draft-editor-form.tsx — CREATE mode for the unified item editor.
 *
 * Parallel to EditorForm (edit mode) but with a simpler state shape:
 *   - All fields start empty / at sensible defaults.
 *   - Pre-generated item UUID (useRef) used for photo Storage paths,
 *     synthetic default-variation rows, and the final createItem
 *     payload. Stable for the form's lifetime so swapping in/out of
 *     drag-and-drop / re-render cycles never invalidates uploaded
 *     storage paths.
 *   - Variations seed with one synthetic default row so the top-level
 *     Price field has something to bind to (same UX as edit mode).
 *   - Photos handled via PhotoUploader's create mode — uploads go to
 *     Storage with the pre-gen item UUID in the path; item_media row
 *     insertion is deferred to createItem's photoUploads payload
 *     dispatched on Save.
 *   - Save → createItem with full payload (basics + variations +
 *     photoUploads). On success: toast + cancelCreating().
 *
 * Why a separate component instead of mode-discriminated EditorForm:
 *   - EditorForm is ~810 LOC. Inlining create branches everywhere
 *     would balloon it past 1000 LOC and obscure the edit flow.
 *   - State shape differs meaningfully: edit has translations,
 *     locale-aware initial values, dirty-tracking against the server
 *     item, delete/duplicate actions. Create has none of those.
 *   - The shared SUB-components (ItemTypeSelect, VariationsEditor,
 *     VariationPriceInput, PhotoUploader, Field primitives) carry
 *     most of the visual weight — duplicating the form wrapper is
 *     cheap. JSX duplication is intentional: the two flows can
 *     evolve independently (e.g., add a "First add photo" prompt
 *     only to create mode) without coupling.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Drawer as DrawerPrimitive } from "vaul";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";

import { cn } from "@/lib/utils";
import { slugify } from "@/lib/catalogs/slug";
import type { CatalogCategory } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";

import { useCanvasSelection } from "./canvas-with-selection";
import { useCanvasLocale } from "./locale-context";
import { createItem, setItemActive } from "./actions";
import { ItemTypeSelect } from "./item-type-select";
import {
  PhotoUploader,
  type PhotoUploaderMedia,
} from "./photo-uploader";
import {
  VariationsEditor,
  VariationPriceInput,
  useVariationsState,
} from "./variations-editor";
import type { CatalogItemProductType } from "./product-types";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export type DraftEditorFormProps = {
  /** Pre-selected category (from startCreating). The merchant can
   *  change it via the Category dropdown. */
  initialCategoryId: string;
  categories: CatalogCategory[];
  orgId: string;
  catalogId: string;
  catalogSlug: string;
  currencySettings: CurrencySettings;
  /** Called when the form actually wants to close (clean state OR
   *  after the merchant confirms Discard in the dialog). The parent
   *  routes this to cancelCreating(). */
  onRequestClose: () => void;
  /** Register a dirty-aware close handler that the parent uses to
   *  intercept backdrop / ESC close paths. */
  onRegisterClose: (fn: () => void) => void;
};

function freshUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function DraftEditorForm({
  initialCategoryId,
  categories,
  orgId,
  catalogId,
  catalogSlug,
  currencySettings,
  onRequestClose,
  onRegisterClose,
}: DraftEditorFormProps) {
  const router = useRouter();
  const { activeLocale, defaultLocale } = useCanvasLocale();
  const isDefaultLocaleEditable = activeLocale === defaultLocale;

  // Pre-gen item UUID — stable for the form's lifetime. Used for
  // photo Storage paths + the synthetic default variation's item_id
  // + the createItem.itemId on Save.
  const draftItemIdRef = React.useRef<string>(freshUuid());
  const draftItemId = draftItemIdRef.current;

  // -------------------------------------------------------------------
  // Form state
  // -------------------------------------------------------------------
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [categoryId, setCategoryId] = React.useState(initialCategoryId);
  const [productType, setProductType] = React.useState<CatalogItemProductType>(
    "REGULAR",
  );
  const [isActive, setIsActive] = React.useState(true);
  const [photos, setPhotos] = React.useState<PhotoUploaderMedia[]>([]);

  // Variations seed: synthetic default row so the top-level Price
  // field has something to bind to. The id is a synthetic UUID — on
  // createItem the server INSERTs a fresh variations row and ignores
  // this id (we pass the variations array shape, not the synthetic id).
  const initialVariations = React.useMemo(
    () => [
      {
        id: freshUuid(),
        item_id: draftItemId,
        catalog_id: catalogId,
        name: "Default",
        price_cents: 0,
        ordinal: 0,
        is_default: true,
        is_sold_out: false,
      },
    ],
    [draftItemId, catalogId],
  );

  const { state: variationsState, dispatch: variationsDispatch } =
    useVariationsState(initialVariations);

  const hasMultipleVariations = variationsState.local.length >= 2;

  // -------------------------------------------------------------------
  // isDirty + Save status
  // -------------------------------------------------------------------
  // Dirty = merchant typed/added anything. Empty form is "not dirty"
  // so the close button skips the discard prompt.
  const isDirty =
    name.trim().length > 0 ||
    slug.trim().length > 0 ||
    description.trim().length > 0 ||
    categoryId !== initialCategoryId ||
    productType !== "REGULAR" ||
    !isActive ||
    photos.length > 0 ||
    variationsState.isDirty;

  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveError, setSaveError] = React.useState<string | null>(null);
  void saveError;

  // -------------------------------------------------------------------
  // Save dispatch
  // -------------------------------------------------------------------
  const handleSave = React.useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Item name is required.");
      return;
    }

    setSaveStatus("saving");
    setSaveError(null);

    // Variations payload — strip __dirty / __markedForDelete flags
    // from the hook's local state and re-stamp ordinals in render
    // order (the user might have reordered).
    const variations = variationsState.local.map((v, idx) => ({
      name: v.name.trim() || "Default",
      price_cents: v.price_cents,
      ordinal: idx,
      is_default: v.is_default,
      is_sold_out: v.is_sold_out,
    }));

    // Photo payload — drop the local-only is_primary flag and let the
    // server set is_primary based on array order. Sort photos in their
    // current grid order; the first becomes primary.
    const photoUploads = photos.map((p) => ({
      id: p.id,
      bucket: p.bucket,
      storage_path: p.storage_path,
      kind: p.kind ?? ("image" as const),
      mime_type: p.mime_type,
      bytes: p.bytes,
      alt: p.alt,
    }));

    const result = await createItem({
      catalogId,
      catalogSlug,
      itemId: draftItemId,
      categoryId,
      productType,
      name: trimmedName,
      // Slug: when empty, server falls back to slugify(name).
      slug: slug.trim() || undefined,
      // Legacy priceCents param — kept for back-compat with createItem's
      // default-only branch. With our explicit variations payload this
      // value is ignored, but createItem requires a number.
      priceCents: variationsState.defaultVariation?.price_cents ?? 0,
      description: description.trim() || null,
      imageAlt: null,
      // Default-locale only at create time. Non-default locale edits
      // happen after first save via the existing EditorForm.
      translations: [],
      variations,
      photoUploads,
    });

    if (!result.ok) {
      setSaveStatus("error");
      setSaveError(result.error ?? "Failed to create item.");
      toast.error(result.error ?? "Failed to create item.");
      return;
    }

    // If merchant chose to create as inactive, dispatch the active
    // toggle action separately — createItem doesn't support it inline.
    if (!isActive && result.itemId) {
      await setItemActive({
        catalogId,
        catalogSlug,
        itemId: result.itemId,
        isActive: false,
      });
    }

    setSaveStatus("saved");
    router.refresh();
    toast.success("Item created");
    onRequestClose();
  }, [
    name,
    slug,
    description,
    categoryId,
    productType,
    isActive,
    photos,
    variationsState.local,
    variationsState.defaultVariation,
    draftItemId,
    catalogId,
    catalogSlug,
    router,
    onRequestClose,
  ]);

  // -------------------------------------------------------------------
  // Discard prompt + dirty-aware close
  // -------------------------------------------------------------------
  const [discardPromptOpen, setDiscardPromptOpen] = React.useState(false);

  const handleClose = React.useCallback(() => {
    if (isDirty) {
      setDiscardPromptOpen(true);
      return;
    }
    onRequestClose();
  }, [isDirty, onRequestClose]);

  const confirmDiscard = React.useCallback(() => {
    setDiscardPromptOpen(false);
    onRequestClose();
  }, [onRequestClose]);

  // Register the dirty-aware handler so parent backdrop/ESC routes
  // through it. handleClose is unstable across renders (closure over
  // isDirty), so register on every render via a ref-callback pattern.
  React.useEffect(() => {
    onRegisterClose(handleClose);
  }, [handleClose, onRegisterClose]);

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  const renderSaveButton = (className?: string) => {
    if (saveStatus === "saving") {
      return (
        <Button disabled className={className}>
          <Loader2 className="size-4 animate-spin" />
          Creating…
        </Button>
      );
    }
    if (saveStatus === "saved") {
      return (
        <Button disabled className={cn("bg-emerald-600 text-white hover:bg-emerald-600", className)}>
          <Check className="size-4" />
          Created
        </Button>
      );
    }
    if (saveStatus === "error") {
      return (
        <Button onClick={handleSave} variant="destructive" className={className}>
          Failed — Retry
        </Button>
      );
    }
    return (
      <Button
        onClick={handleSave}
        disabled={!isDirty || !variationsState.isValid}
        className={className}
      >
        Create
      </Button>
    );
  };

  return (
    <>
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
          <span className="block text-xs text-muted-foreground">New item</span>
          <h2 className="truncate text-base font-semibold tracking-tight">
            {name.trim() || "Untitled"}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {renderSaveButton()}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full [&>[data-slot=scroll-area-viewport]]:overscroll-contain">
          <div
            className={cn(
              "mx-auto flex max-w-[1248px] gap-6 p-4 md:p-6",
              "flex-col lg:flex-row",
            )}
          >
            {/* Left column */}
            <div className="flex min-w-0 flex-1 flex-col gap-5">
              <Field data-disabled={!isDefaultLocaleEditable ? true : undefined}>
                <FieldLabel htmlFor="draft-item-type">Item type</FieldLabel>
                <ItemTypeSelect
                  id="draft-item-type"
                  value={productType}
                  onValueChange={setProductType}
                  disabled={!isDefaultLocaleEditable}
                />
              </Field>

              <div className="flex flex-col gap-2">
                <Label htmlFor="draft-name" className="text-sm font-medium">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="draft-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Item name"
                  autoComplete="off"
                  autoFocus
                />
              </div>

              <Field data-disabled={!isDefaultLocaleEditable ? true : undefined}>
                <FieldLabel htmlFor="draft-slug">Web link</FieldLabel>
                <Input
                  id="draft-slug"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  onBlur={() => {
                    const trimmed = slug.trim();
                    if (trimmed) setSlug(slugify(trimmed));
                  }}
                  placeholder="auto-generated-from-name"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={!isDefaultLocaleEditable}
                />
                <FieldDescription>
                  This is the short text at the end of the link your
                  customers will see and share. We make one for you from
                  the item&apos;s name — change it if you want a shorter
                  or easier-to-remember link.
                </FieldDescription>
              </Field>

              <Field
                data-disabled={
                  hasMultipleVariations ||
                  !isDefaultLocaleEditable ||
                  !variationsState.defaultVariation
                    ? true
                    : undefined
                }
              >
                <FieldLabel htmlFor="draft-price">Price</FieldLabel>
                <VariationPriceInput
                  id="draft-price"
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
                    Price varies by variation — edit each below.
                  </FieldDescription>
                )}
              </Field>

              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="draft-description"
                  className="text-sm font-medium"
                >
                  Description
                </Label>
                <Textarea
                  id="draft-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Customer-facing description"
                  rows={4}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Photos</Label>
                <PhotoUploader
                  itemId={draftItemId}
                  orgId={orgId}
                  catalogId={catalogId}
                  media={photos}
                  onLocalMediaChange={setPhotos}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Variations</Label>
                <VariationsEditor
                  state={variationsState}
                  dispatch={variationsDispatch}
                  currencySettings={currencySettings}
                  isLocaleEditable={isDefaultLocaleEditable}
                />
              </div>
            </div>

            {/* Right column — Category, Status */}
            <aside className="flex w-full flex-col gap-5 lg:w-80">
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="draft-category"
                  className="text-sm font-medium"
                >
                  Category
                </Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="draft-category">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-start justify-between gap-2 rounded-md border bg-card p-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Label
                    htmlFor="draft-active"
                    className="text-sm font-medium"
                  >
                    Visible to customers
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    Turn off to create the item as a draft.
                  </span>
                </div>
                <Switch
                  id="draft-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
            </aside>
          </div>
        </ScrollArea>
      </div>

      <AlertDialog
        open={discardPromptOpen}
        onOpenChange={setDiscardPromptOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard new item?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Closing will lose anything you
              typed and any photos you uploaded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* vaul Drawer title is required for accessibility (sr-only). */}
      <DrawerPrimitive.Title className="sr-only">
        Create new item
      </DrawerPrimitive.Title>
    </>
  );
}
