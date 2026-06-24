"use client";

/**
 * category-editor-drawer.tsx — Square-style fullscreen editor for catalog
 * categories. Mirrors the item editor's chrome (apps/krafta/app/dashboard/
 * [orgSlug]/[catalogSlug]/items/_components/editor-sheet.tsx):
 *
 *   - vaul DrawerPrimitive slides up from the bottom on every viewport,
 *     covers the full screen, no overlay dim.
 *   - Sticky header: close X (left), "Editing — name" / "New category"
 *     (center), Actions menu + Save (right). Delete lives in Actions on
 *     edit mode only.
 *   - Two-column body on lg+: left = translations (Name + Description per
 *     enabled locale), right = URL card (slug). Stacks single-column below.
 *   - Discard-changes AlertDialog when closing with a dirty form.
 *   - Save state machine matches the item editor (idle → saving → error;
 *     success auto-closes via toast).
 *   - rounded-md buttons (default), no rounded-full pills.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Drawer as DrawerPrimitive } from "vaul";
import { Loader2, MoreHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";

import { cn } from "@/lib/utils";
import { slugify } from "@/lib/catalogs/slug";
import type { CatalogCategory } from "@/lib/catalogs/types";

import { createCategory, deleteCategory, updateCategory } from "./actions";

type LocaleOption = {
  id: string;
  locale: string;
  is_default: boolean;
  is_enabled: boolean;
  sort_order: number;
};

type CategoryTranslation = {
  id: string;
  category_id: string;
  locale: string;
  name: string;
  description: string | null;
};

type TranslationState = {
  name: string;
  description: string;
};

type SaveStatus = "idle" | "saving" | "error";

export type CategoryEditorDrawerProps = {
  catalogId: string;
  catalogSlug: string;
  locales: LocaleOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  category?: CatalogCategory;
  initialTranslations?: CategoryTranslation[];
  existingSlugs?: string[];
  onDeleted?: (category: CatalogCategory) => void;
};

export function CategoryEditorDrawer({
  catalogId,
  catalogSlug,
  locales,
  open,
  onOpenChange,
  mode,
  category,
  initialTranslations = [],
  existingSlugs = [],
  onDeleted,
}: CategoryEditorDrawerProps) {
  // Lift the close handler into a ref so backdrop / ESC / swipe-down all
  // route through the form's dirty-aware path. The form re-registers on
  // every render.
  const closeRequestRef = React.useRef<() => void>(() => {
    onOpenChange(false);
  });

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) {
        closeRequestRef.current();
      }
    },
    [],
  );

  // Body scroll lock — defense in depth (matches editor-sheet.tsx). vaul
  // ships its own lock but skips parts of the setup when
  // shouldScaleBackground={false}.
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

  const registerCloseHandler = (fn: () => void) => {
    closeRequestRef.current = fn;
  };

  const onRequestClose = () => {
    onOpenChange(false);
  };

  return (
    <DrawerPrimitive.Root
      open={open}
      onOpenChange={handleOpenChange}
      shouldScaleBackground={false}
    >
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Content
          data-slot="category-editor-drawer"
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-background",
            "overflow-hidden",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            "duration-300",
          )}
        >
          <DrawerPrimitive.Title className="sr-only">
            {mode === "edit"
              ? `Edit category: ${category?.name || "Untitled category"}`
              : "New category"}
          </DrawerPrimitive.Title>
          <DrawerPrimitive.Description className="sr-only">
            Add translations and metadata for this catalog category.
          </DrawerPrimitive.Description>
          <EditorForm
            key={mode === "edit" ? `edit-${category?.id ?? ""}` : "create"}
            catalogId={catalogId}
            catalogSlug={catalogSlug}
            locales={locales}
            mode={mode}
            category={category}
            initialTranslations={initialTranslations}
            existingSlugs={existingSlugs}
            onRequestClose={onRequestClose}
            onRegisterClose={registerCloseHandler}
            onDeleted={onDeleted}
          />
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}

type EditorFormProps = {
  catalogId: string;
  catalogSlug: string;
  locales: LocaleOption[];
  mode: "create" | "edit";
  category?: CatalogCategory;
  initialTranslations: CategoryTranslation[];
  existingSlugs: string[];
  onRequestClose: () => void;
  onRegisterClose: (fn: () => void) => void;
  onDeleted?: (category: CatalogCategory) => void;
};

function EditorForm({
  catalogId,
  catalogSlug,
  locales,
  mode,
  category,
  initialTranslations,
  existingSlugs,
  onRequestClose,
  onRegisterClose,
  onDeleted,
}: EditorFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit" && !!category;

  const enabledLocales = React.useMemo(
    () =>
      locales
        .filter((locale) => locale.is_enabled)
        .sort((a, b) => a.sort_order - b.sort_order),
    [locales],
  );

  const defaultLocale =
    enabledLocales.find((locale) => locale.is_default)?.locale ??
    enabledLocales[0]?.locale ??
    "en";

  // ---------------------------------------------------------------------
  // Initial state — seed per-locale name/description + slug from props.
  // ---------------------------------------------------------------------
  const initialTranslationState = React.useMemo<
    Record<string, TranslationState>
  >(() => {
    const next: Record<string, TranslationState> = {};
    enabledLocales.forEach((locale) => {
      const existing = initialTranslations.find(
        (translation) => translation.locale === locale.locale,
      );
      next[locale.locale] = {
        name:
          existing?.name ??
          (locale.locale === defaultLocale ? category?.name ?? "" : ""),
        description: existing?.description ?? "",
      };
    });
    return next;
  }, [
    category?.name,
    defaultLocale,
    enabledLocales,
    initialTranslations,
  ]);

  const [translations, setTranslations] = React.useState<
    Record<string, TranslationState>
  >(initialTranslationState);

  const initialSlug = category?.slug ?? "";
  const [slug, setSlug] = React.useState(initialSlug);
  const [slugTouched, setSlugTouched] = React.useState(false);

  const defaultName = translations[defaultLocale]?.name ?? "";

  // Auto-derive slug from default name on create. Once the merchant
  // touches the slug, stop overwriting.
  React.useEffect(() => {
    if (isEdit) return;
    if (slugTouched) return;
    setSlug(slugify(defaultName));
  }, [defaultName, isEdit, slugTouched]);

  // ---------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------
  const slugError = React.useMemo(() => {
    const normalized = slug.trim().toLowerCase();
    const canValidate =
      slugTouched || defaultName.trim().length > 0 || isEdit;
    if (!normalized) {
      return canValidate ? "Category slug could not be generated." : null;
    }
    const collides = existingSlugs.some(
      (existing) =>
        existing.toLowerCase() === normalized &&
        existing.toLowerCase() !== (category?.slug ?? "").toLowerCase(),
    );
    return collides ? "This slug is already used in this catalog." : null;
  }, [category?.slug, defaultName, existingSlugs, isEdit, slug, slugTouched]);

  // ---------------------------------------------------------------------
  // Dirty tracking
  // ---------------------------------------------------------------------
  const isDirty = React.useMemo(() => {
    if (slug.trim() !== initialSlug) return true;
    return enabledLocales.some((locale) => {
      const next = translations[locale.locale];
      const previous = initialTranslationState[locale.locale];
      return (
        (next?.name ?? "") !== (previous?.name ?? "") ||
        (next?.description ?? "") !== (previous?.description ?? "")
      );
    });
  }, [
    enabledLocales,
    initialSlug,
    initialTranslationState,
    slug,
    translations,
  ]);

  // ---------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveError, setSaveError] = React.useState<string | null>(null);

  function updateTranslation(
    locale: string,
    field: keyof TranslationState,
    value: string,
  ) {
    setTranslations((prev) => ({
      ...prev,
      [locale]: {
        ...prev[locale],
        [field]: value,
      },
    }));
  }

  const handleSave = React.useCallback(async () => {
    if (!defaultName.trim()) {
      toast.error("Category name is required.");
      return;
    }
    if (slugError) {
      toast.error(slugError);
      return;
    }
    if (!slug.trim()) {
      toast.error("Category slug could not be generated.");
      return;
    }

    setSaveStatus("saving");
    setSaveError(null);

    const payload = enabledLocales.map((locale) => ({
      locale: locale.locale,
      name: translations[locale.locale]?.name ?? "",
      description: translations[locale.locale]?.description ?? "",
    }));

    const result =
      isEdit && category
        ? await updateCategory({
            catalogId,
            catalogSlug,
            categoryId: category.id,
            name: defaultName,
            slug,
            translations: payload,
          })
        : await createCategory({
            catalogId,
            catalogSlug,
            name: defaultName,
            slug,
            translations: payload,
          });

    if (!result.ok) {
      setSaveStatus("error");
      const message = result.error ?? "Failed to save category.";
      setSaveError(message);
      toast.error(message);
      return;
    }

    setSaveStatus("idle");
    router.refresh();
    toast.success(isEdit ? "Category saved." : "Category created.");
    onRequestClose();
  }, [
    catalogId,
    catalogSlug,
    category,
    defaultName,
    enabledLocales,
    isEdit,
    onRequestClose,
    router,
    slug,
    slugError,
    translations,
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

  React.useEffect(() => {
    onRegisterClose(handleClose);
  }, [handleClose, onRegisterClose]);

  const handleConfirmDiscard = React.useCallback(() => {
    setDiscardPromptOpen(false);
    onRequestClose();
  }, [onRequestClose]);

  // ---------------------------------------------------------------------
  // Delete (edit mode only)
  // ---------------------------------------------------------------------
  const [deletePromptOpen, setDeletePromptOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleDelete = React.useCallback(async () => {
    if (!category) return;
    setIsDeleting(true);
    try {
      const result = await deleteCategory({
        catalogId,
        catalogSlug,
        categoryId: category.id,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Failed to delete category.");
        return;
      }
      toast.success(
        result.deletedItems
          ? `Category and ${result.deletedItems} item${
              result.deletedItems === 1 ? "" : "s"
            } deleted.`
          : "Category deleted.",
      );
      setDeletePromptOpen(false);
      onDeleted?.(category);
      onRequestClose();
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete category.";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  }, [
    catalogId,
    catalogSlug,
    category,
    onDeleted,
    onRequestClose,
    router,
  ]);

  // ---------------------------------------------------------------------
  // Save button rendering
  // ---------------------------------------------------------------------
  const renderSaveButton = () => {
    if (saveStatus === "saving") {
      return (
        <Button disabled>
          <Loader2 className="size-4 animate-spin" />
          Saving…
        </Button>
      );
    }
    if (saveStatus === "error") {
      return (
        <Button onClick={handleSave}>Save failed — Retry</Button>
      );
    }
    return (
      <Button
        onClick={handleSave}
        disabled={(!isDirty && isEdit) || !!slugError}
      >
        Save
      </Button>
    );
  };

  const titleLabel = isEdit
    ? defaultName.trim() || category?.name || "Untitled category"
    : defaultName.trim() || "New category";
  const titleEyebrow = isEdit ? "Editing" : "New category";

  const showLocaleLabels = enabledLocales.length > 1;
  const slugPreview = slug.trim() || "category-slug";

  return (
    <>
      {/* Header — mirrors the item editor: close X (left), title (center),
          Actions + Save (right). */}
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
          <span className="block text-xs text-muted-foreground">
            {titleEyebrow}
          </span>
          <h2 className="truncate text-base font-semibold tracking-tight">
            {titleLabel}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isEdit ? (
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
                  onSelect={(event) => {
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
          ) : null}

          <AlertDialog
            open={deletePromptOpen}
            onOpenChange={setDeletePromptOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this category?</AlertDialogTitle>
                <AlertDialogDescription>
                  &ldquo;{titleLabel}&rdquo; and all of its items will be
                  removed permanently. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  Delete category
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {renderSaveButton()}
        </div>
      </header>

      {/* Form body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full [&>[data-slot=scroll-area-viewport]]:overscroll-contain">
          <div
            className={cn(
              "mx-auto flex max-w-[1248px] gap-6 p-4 md:p-6",
              "flex-col lg:flex-row",
            )}
          >
            {/* Left column — translations */}
            <div className="flex min-w-0 flex-1 flex-col gap-5">
              <section className="flex flex-col gap-5 rounded-md border bg-card p-4 md:p-5">
                <div className="flex flex-col gap-1">
                  <Label className="text-sm font-semibold">Details</Label>
                  <span className="text-xs text-muted-foreground">
                    {showLocaleLabels
                      ? "Add translations for every enabled locale. The default locale name is the category's primary label."
                      : "The category's primary label and an optional customer-facing description."}
                  </span>
                </div>

                <div className="flex flex-col gap-6">
                  {enabledLocales.map((locale) => {
                    const isDefault = locale.locale === defaultLocale;
                    const localeKey = locale.locale;
                    const state = translations[localeKey] ?? {
                      name: "",
                      description: "",
                    };
                    return (
                      <div
                        key={locale.id}
                        className="flex flex-col gap-4"
                      >
                        {showLocaleLabels ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                              {localeKey}
                            </span>
                            {isDefault ? (
                              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Default
                              </span>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="flex flex-col gap-2">
                          <Label
                            htmlFor={`category-name-${locale.id}`}
                            className="text-sm font-medium"
                          >
                            Name{" "}
                            {isDefault ? (
                              <span className="text-destructive">*</span>
                            ) : null}
                          </Label>
                          <Input
                            id={`category-name-${locale.id}`}
                            placeholder="Category name"
                            value={state.name}
                            onChange={(event) =>
                              updateTranslation(
                                localeKey,
                                "name",
                                event.target.value,
                              )
                            }
                            required={isDefault}
                            autoComplete="off"
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          <Label
                            htmlFor={`category-description-${locale.id}`}
                            className="text-sm font-medium"
                          >
                            Description
                          </Label>
                          <Textarea
                            id={`category-description-${locale.id}`}
                            placeholder="Optional description shown on the storefront"
                            value={state.description}
                            onChange={(event) =>
                              updateTranslation(
                                localeKey,
                                "description",
                                event.target.value,
                              )
                            }
                            rows={3}
                            className="min-h-22 resize-none"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* Right column — URL / metadata */}
            <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[320px]">
              <MetadataCard title="URL">
                <Field data-invalid={!!slugError}>
                  <FieldLabel
                    htmlFor="category-slug"
                    className="sr-only"
                  >
                    Slug
                  </FieldLabel>
                  <Input
                    id="category-slug"
                    placeholder="category-slug"
                    value={slug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      setSlug(slugify(event.target.value));
                    }}
                    autoComplete="off"
                  />
                  <FieldDescription className="font-mono text-xs">
                    krafta.uz/{catalogSlug}/{slugPreview}
                  </FieldDescription>
                  {slugError ? (
                    <FieldError>{slugError}</FieldError>
                  ) : null}
                </Field>
              </MetadataCard>
            </div>
          </div>

          {saveStatus === "error" && saveError ? (
            <div className="border-t bg-destructive/5 px-4 py-3 text-sm text-destructive md:px-6">
              <span className="font-medium">Save failed:</span> {saveError}
            </div>
          ) : null}
        </ScrollArea>
      </div>

      <AlertDialog
        open={discardPromptOpen}
        onOpenChange={setDiscardPromptOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits will be lost. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

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
