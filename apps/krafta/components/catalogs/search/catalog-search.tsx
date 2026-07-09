"use client";

import * as React from "react";
import Image from "next/image";
import { Search, X } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
  PublicCategoryWithItems,
  PublicItem,
} from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { getItemImageUrl } from "@/lib/catalogs/media";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { pickLocalizedField } from "@/lib/catalogs/i18n";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import {
  getStorefrontMessage,
  getStorefrontPlural,
} from "@/lib/locales/messages";
import { useItemSheet } from "@/components/catalogs/items/item-detail-controller";
import { DialogTitle } from "@radix-ui/react-dialog";

type SearchDocument = {
  id: string;
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  score?: number | null;
  mode?: string | null;
  distance?: number | null;
  type?: string | null;
  document_type?: string | null;
  entity_type?: string | null;
  source_id?: string | null;
  source_table?: string | null;
  category_id?: string | null;
  category_slug?: string | null;
  item_id?: string | null;
  item_slug?: string | null;
};

export type CatalogSearchProps = {
  catalogId: string;
  orgId?: string | null;
  categoriesWithItems: PublicCategoryWithItems[];
  currencySettings?: CurrencySettings;
  /** Controlled-open API. Pass both to lift the dialog state into the
   *  storefront dock — the dock owns the visible search input that
   *  triggers the dialog. When undefined, the component falls back to
   *  internal state + renders its legacy floating bottom-right button
   *  as the trigger. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type ItemMatch = {
  item: PublicItem;
  categorySlug: string | null;
  result?: SearchDocument;
};

type CategoryMatch = {
  category: PublicCategoryWithItems;
  result?: SearchDocument;
};

const SEARCH_DEBOUNCE_MS = 220;
const MIN_LOADING_MS = 250;

function getResultType(result: SearchDocument): string {
  return (
    result.type ??
    result.document_type ??
    result.entity_type ??
    ""
  ).toLowerCase();
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function CatalogSearch({
  catalogId,
  orgId,
  categoriesWithItems,
  currencySettings,
  open: controlledOpen,
  onOpenChange,
}: CatalogSearchProps) {
  const { openItem } = useItemSheet();
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const t = (key: Parameters<typeof getStorefrontMessage>[0]) =>
    getStorefrontMessage(key, { activeLocale, defaultLocale });
  // Controlled vs uncontrolled: when the storefront dock passes both
  // `open` and `onOpenChange`, those drive the dialog state and the
  // legacy floating trigger is suppressed. Otherwise we keep the
  // original internal-state + floating-button behavior for any caller
  // that hasn't migrated to the dock yet.
  const isControlled = controlledOpen !== undefined && Boolean(onOpenChange);
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = isControlled ? (controlledOpen as boolean) : internalOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (isControlled) {
        onOpenChange?.(next);
      } else {
        setInternalOpen(next);
      }
    },
    [isControlled, onOpenChange],
  );
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchDocument[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const requestIdRef = React.useRef(0);
  const loadingStartRef = React.useRef(0);
  const loadingTimerRef = React.useRef<number | null>(null);

  // Localized display-name maps for the dropdown rendering AND for the
  // title-based result resolver (which matches `result.title` against
  // entity titles when the server response lacks an id). Indexing the
  // localized title means a customer browsing in Russian who searches for
  // "Кофе" will still match the right entity even if the search-document
  // text is locale-specific upstream.
  const localizedItemNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    categoriesWithItems.forEach((category) => {
      category.items.forEach((item) => {
        map.set(
          item.id,
          pickLocalizedField({
            translations: item.translations,
            defaults: {
              name: item.name,
              description: item.description,
              image_alt: item.image_alt,
            },
            activeLocale,
            defaultLocale,
            field: "name",
          }).value,
        );
      });
    });
    return map;
  }, [categoriesWithItems, activeLocale, defaultLocale]);
  const localizedItemDescriptionById = React.useMemo(() => {
    const map = new Map<string, string | null>();
    categoriesWithItems.forEach((category) => {
      category.items.forEach((item) => {
        const value = pickLocalizedField({
          translations: item.translations,
          defaults: {
            name: item.name,
            description: item.description,
            image_alt: item.image_alt,
          },
          activeLocale,
          defaultLocale,
          field: "description",
        }).value;
        map.set(item.id, value || null);
      });
    });
    return map;
  }, [categoriesWithItems, activeLocale, defaultLocale]);
  const localizedItemImageAltById = React.useMemo(() => {
    const map = new Map<string, string | null>();
    categoriesWithItems.forEach((category) => {
      category.items.forEach((item) => {
        const value = pickLocalizedField({
          translations: item.translations,
          defaults: {
            name: item.name,
            description: item.description,
            image_alt: item.image_alt,
          },
          activeLocale,
          defaultLocale,
          field: "image_alt",
        }).value;
        map.set(item.id, value || null);
      });
    });
    return map;
  }, [categoriesWithItems, activeLocale, defaultLocale]);
  const localizedCategoryNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    categoriesWithItems.forEach((category) => {
      map.set(
        category.id,
        pickLocalizedField({
          translations: category.translations,
          defaults: {
            name: category.name,
            description: category.description ?? null,
            image_alt: null,
          },
          activeLocale,
          defaultLocale,
          field: "name",
        }).value,
      );
    });
    return map;
  }, [categoriesWithItems, activeLocale, defaultLocale]);

  const searchIndex = React.useMemo(() => {
    const categoryById = new Map<string, PublicCategoryWithItems>();
    const categoryBySlug = new Map<string, PublicCategoryWithItems>();
    const categoryByTitle = new Map<string, PublicCategoryWithItems>();
    const itemById = new Map<string, PublicItem>();
    const itemBySlug = new Map<string, PublicItem>();
    const itemByTitle = new Map<string, PublicItem>();
    const categorySlugForItemId = new Map<string, string | null>();

    if (!open) {
      return {
        categoryById,
        categoryBySlug,
        categoryByTitle,
        itemById,
        itemBySlug,
        itemByTitle,
        categorySlugForItemId,
      };
    }

    categoriesWithItems.forEach((category) => {
      categoryById.set(category.id, category);

      const categorySlug = category.slug ?? String(category.id);
      categoryBySlug.set(categorySlug, category);

      // Index by canonical AND localized titles so search-document titles
      // in either locale can resolve to the right entity.
      const categoryTitle = normalizeLabel(category.name);
      if (categoryTitle) categoryByTitle.set(categoryTitle, category);
      const categoryLocalizedTitle = normalizeLabel(
        localizedCategoryNameById.get(category.id) ?? category.name,
      );
      if (categoryLocalizedTitle)
        categoryByTitle.set(categoryLocalizedTitle, category);

      category.items.forEach((item) => {
        itemById.set(item.id, item);

        const itemSlug = item.slug ?? String(item.id);
        itemBySlug.set(itemSlug, item);
        categorySlugForItemId.set(item.id, categorySlug);

        const itemTitle = normalizeLabel(item.name);
        if (itemTitle) itemByTitle.set(itemTitle, item);
        const itemLocalizedTitle = normalizeLabel(
          localizedItemNameById.get(item.id) ?? item.name,
        );
        if (itemLocalizedTitle) itemByTitle.set(itemLocalizedTitle, item);
      });
    });

    return {
      categoryById,
      categoryBySlug,
      categoryByTitle,
      itemById,
      itemBySlug,
      itemByTitle,
      categorySlugForItemId,
    };
  }, [
    categoriesWithItems,
    open,
    localizedCategoryNameById,
    localizedItemNameById,
  ]);

  const {
    categoryById,
    categoryBySlug,
    categoryByTitle,
    itemById,
    itemBySlug,
    itemByTitle,
    categorySlugForItemId,
  } = searchIndex;

  const resolvedResults = React.useMemo(() => {
    if (!open || results.length === 0) {
      return { items: [], categories: [] };
    }

    const items = new Map<string, ItemMatch>();
    const categories = new Map<string, CategoryMatch>();

    results.forEach((result) => {
      const resultType = getResultType(result);
      let resolvedItem: PublicItem | null = null;
      let resolvedCategory: PublicCategoryWithItems | null = null;
      const sourceTable = result.source_table?.toLowerCase() ?? "";
      const sourceId = result.source_id ?? null;
      const resultTags = (result.tags ?? []).map((tag) => tag.toLowerCase());
      const normalizedTitle = result.title ? normalizeLabel(result.title) : "";

      if (sourceId && sourceTable.includes("item")) {
        resolvedItem = itemById.get(sourceId) ?? itemBySlug.get(sourceId) ?? null;
      } else if (sourceId && sourceTable.includes("category")) {
        resolvedCategory =
          categoryById.get(sourceId) ?? categoryBySlug.get(sourceId) ?? null;
      } else if (result.item_id) {
        resolvedItem = itemById.get(result.item_id) ?? null;
      } else if (result.item_slug) {
        resolvedItem = itemBySlug.get(result.item_slug) ?? null;
      }

      if (!resolvedCategory && result.category_id) {
        resolvedCategory = categoryById.get(result.category_id) ?? null;
      } else if (!resolvedCategory && result.category_slug) {
        resolvedCategory = categoryBySlug.get(result.category_slug) ?? null;
      }

      if (!resolvedItem && !resolvedCategory && resultType) {
        if (resultType.includes("item")) {
          resolvedItem = itemById.get(result.id) ?? null;
        } else if (resultType.includes("category")) {
          resolvedCategory = categoryById.get(result.id) ?? null;
        }
      }

      if (!resolvedItem && !resolvedCategory && normalizedTitle) {
        if (resultTags.includes("item")) {
          resolvedItem = itemByTitle.get(normalizedTitle) ?? null;
        } else if (resultTags.includes("category")) {
          resolvedCategory = categoryByTitle.get(normalizedTitle) ?? null;
        } else {
          resolvedItem = itemByTitle.get(normalizedTitle) ?? null;
          if (!resolvedItem) {
            resolvedCategory = categoryByTitle.get(normalizedTitle) ?? null;
          }
        }
      }

      if (!resolvedItem && !resolvedCategory) {
        resolvedItem = itemById.get(result.id) ?? null;
      }

      if (!resolvedItem && !resolvedCategory) {
        resolvedCategory = categoryById.get(result.id) ?? null;
      }

      if (resolvedItem) {
        const categorySlug = categorySlugForItemId.get(resolvedItem.id) ?? null;
        items.set(resolvedItem.id, { item: resolvedItem, categorySlug, result });
        return;
      }

      if (resolvedCategory) {
        categories.set(resolvedCategory.id, { category: resolvedCategory, result });
      }
    });

    return {
      items: Array.from(items.values()),
      categories: Array.from(categories.values()),
    };
  }, [
    open,
    results,
    categoryById,
    categoryBySlug,
    categoryByTitle,
    itemById,
    itemBySlug,
    itemByTitle,
    categorySlugForItemId,
  ]);

  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setIsLoading(false);
      setHasError(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const term = query.trim();

    if (!term) {
      setResults([]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    loadingStartRef.current = Date.now();
    if (loadingTimerRef.current) {
      window.clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
    setIsLoading(true);
    setHasError(false);

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: term,
            catalogId,
            orgId,
            limit: 20,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Search request failed");
        }

        const data = await response.json();
        if (requestId !== requestIdRef.current) return;

        const nextResults = Array.isArray(data) ? data : data?.results ?? [];
        setResults(nextResults as SearchDocument[]);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        if (requestId !== requestIdRef.current) return;
        setResults([]);
        setHasError(true);
      } finally {
        if (requestId !== requestIdRef.current) return;
        const elapsed = Date.now() - loadingStartRef.current;
        if (elapsed < MIN_LOADING_MS) {
          loadingTimerRef.current = window.setTimeout(() => {
            setIsLoading(false);
            loadingTimerRef.current = null;
          }, MIN_LOADING_MS - elapsed);
        } else {
          setIsLoading(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [catalogId, orgId, open, query]);

  const handleCategorySelect = React.useCallback((category: PublicCategoryWithItems) => {
    const targetId = `category-${category.slug ?? category.id}`;
    setOpen(false);

    window.setTimeout(() => {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 0);
  }, []);

  const handleItemSelect = React.useCallback(
    (match: ItemMatch) => {
      setOpen(false);
      openItem(match.item.slug ?? match.item.id, match.categorySlug);
    },
    [openItem],
  );

  const hasResults =
    resolvedResults.items.length > 0 || resolvedResults.categories.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Legacy floating trigger — rendered only when the dialog state
          is uncontrolled (no dock wiring). The storefront dock owns
          its own input which calls onOpenChange directly; we don't
          want a second floating button competing with it. */}
      {!isControlled ? (
        <DialogTrigger asChild>
          <Button
            type="button"
            aria-label={t("search.open_aria")}
            variant="default"
            size="icon-lg"
            className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full "
          >
            <Search />
          </Button>
        </DialogTrigger>
      ) : null}

      <DialogContent
        showCloseButton={false}
        className={cn(
          "fixed inset-0 !left-0 !top-0 z-50 h-[100dvh] w-[100dvw] !translate-x-0 !translate-y-0",
          "!max-w-none !rounded-none !border-0 !p-0",
          "bg-background",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
        )}
      >
        <DialogTitle className="sr-only">{t("search.title")}</DialogTitle>
        <div className="flex h-full w-full min-h-0 flex-col gap-6 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("search.placeholder")}
                className="h-12 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-base shadow-none"
              />
            </div>
            <DialogClose asChild>
              <Button
                type="button"
                aria-label={t("search.close_aria")}
                variant="outline"
                size="icon"
                className="rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pb-6">
            {!query.trim() && (
              <p className="text-sm text-muted-foreground">
                {t("search.prompt")}
              </p>
            )}

            {hasError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {t("search.error")}
              </div>
            )}

            {isLoading && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-32" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, index) => (
                      <div key={`category-skeleton-${index}`} className="rounded-lg border bg-card px-4 py-5">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="mt-2 h-3 w-1/2" />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={`item-skeleton-${index}`}
                        className="flex items-center gap-4 rounded-md border bg-card px-3 py-3"
                      >
                        <Skeleton className="h-12 w-12 rounded-sm" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/5" />
                          <Skeleton className="h-3 w-2/5" />
                        </div>
                        <Skeleton className="h-4 w-16" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!isLoading && query.trim() && !hasResults && !hasError && (
              <p className="text-sm text-muted-foreground">
                {t("search.no_results")}
              </p>
            )}

            {!isLoading && resolvedResults.items.length > 0 && (
              <section className="space-y-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("search.items_heading")}
                </div>
                <div className="space-y-3">
                  {resolvedResults.items.map((match) => {
                    const imageUrl = getItemImageUrl(match.item);
                    const itemName =
                      localizedItemNameById.get(match.item.id) ??
                      match.item.name;
                    const itemDescription =
                      localizedItemDescriptionById.get(match.item.id) ?? null;
                    const itemImageAlt =
                      localizedItemImageAltById.get(match.item.id) ?? null;

                    return (
                      <button
                        key={match.item.id}
                        type="button"
                        onClick={() => handleItemSelect(match)}
                        className="flex w-full items-center gap-4 rounded-md border border-border bg-card px-3 py-3 text-left transition hover:border-foreground/30"
                      >
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-sm bg-muted">
                          {imageUrl ? (
                            <Image
                              src={imageUrl}
                              alt={itemImageAlt ?? itemName}
                              fill
                              sizes="48px"
                              className="object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="line-clamp-2 text-sm font-semibold">
                            {itemName}
                          </span>
                          {itemDescription && (
                            <span className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                              {itemDescription}
                            </span>
                          )}
                        </div>
                        <div className="ml-2 shrink-0 font-mono text-sm font-semibold tabular-nums">
                          {formatPriceCents(match.item.price_cents, currencySettings)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {!isLoading && resolvedResults.categories.length > 0 && (
              <section className="space-y-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("search.categories_heading")}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {resolvedResults.categories.map(({ category }) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => handleCategorySelect(category)}
                      className="rounded-lg border border-border bg-card px-4 py-5 text-left transition hover:border-foreground/30"
                    >
                      <div className="text-base font-semibold">
                        {localizedCategoryNameById.get(category.id) ??
                          category.name}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {getStorefrontPlural(
                          "cart.item_count_plural",
                          category.items.length,
                          { activeLocale, defaultLocale },
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
