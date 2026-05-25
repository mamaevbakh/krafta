// components/catalogs/items/item-detail-controller.tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";

import type { PublicCategoryWithItems, PublicItem } from "@/lib/catalogs/types";
import type { ItemDetailVariant } from "@/lib/catalogs/settings/layout";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { getItemImageUrl } from "@/lib/catalogs/media";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";

// S6 (2026-05-25): the legacy bottom-sheet variant is gone — fullscreen
// is the only render mode. The variant prop on the provider stays for
// backward compatibility with callers that still pass it (RSC catalog
// layout, preview page) but is otherwise unused.
const ItemDetailFullscreen = dynamic(() =>
  import("@/components/catalogs/items/item-detail-fullscreen-view").then(
    (module) => module.ItemDetailFullscreen,
  ),
);

// ---- context --------------------------------------------------------------

type ItemSheetContextValue = {
  openItem: (itemSlug: string, categorySlug?: string | null) => void;
  closeItem: () => void;
};

const ItemSheetContext = createContext<ItemSheetContextValue | null>(null);

// ---- provider -------------------------------------------------------------

type ItemSheetProviderProps = {
  categoriesWithItems: PublicCategoryWithItems[];
  activeCategorySlug?: string | null;
  activeItemSlug?: string | null;
  baseHref: string;
  children: ReactNode;
  itemAspectRatio?: number;
  itemDetailVariant?: ItemDetailVariant;
  currencySettings?: CurrencySettings;
};

export function ItemSheetProvider({
  categoriesWithItems,
  activeCategorySlug = null,
  activeItemSlug = null,
  baseHref,
  children,
  itemAspectRatio,
  // itemDetailVariant prop is still accepted by the type for backward
  // compat with older callers, but intentionally not destructured —
  // only "item-fullscreen" renders now.
  currencySettings,
}: ItemSheetProviderProps) {
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const normalizedBase = useMemo(
    () => baseHref.replace(/\/+$/, "") || "/",
    [baseHref],
  );

  // --- lookup maps ---------------------------------------------------------

  const itemLookup = useMemo(() => {
    const map: Record<string, PublicItem> = {};
    categoriesWithItems.forEach((category) => {
      category.items.forEach((item) => {
        const slug = item.slug ?? String(item.id);
        map[slug] = item;
      });
    });
    return map;
  }, [categoriesWithItems]);

  const itemToCategorySlug = useMemo(() => {
    const map: Record<string, string | null> = {};
    categoriesWithItems.forEach((category) => {
      const categorySlug = category.slug ?? String(category.id);
      category.items.forEach((item) => {
        const slug = item.slug ?? String(item.id);
        map[slug] = categorySlug;
      });
    });
    return map;
  }, [categoriesWithItems]);

  const categoryBySlug = useMemo(() => {
    const map: Record<string, PublicCategoryWithItems> = {};
    categoriesWithItems.forEach((category) => {
      const key = category.slug ?? String(category.id);
      map[key] = category;
    });
    return map;
  }, [categoriesWithItems]);

  const baseSegments = useMemo(
    () =>
      normalizedBase
        .replace(/^\/+/, "")
        .split("/")
        .filter(Boolean),
    [normalizedBase],
  );

  // --- state ---------------------------------------------------------------

  const [open, setOpen] = useState<boolean>(
    !!activeItemSlug && !!itemLookup[activeItemSlug],
  );
  const [currentItemSlug, setCurrentItemSlug] = useState<string | null>(
    activeItemSlug ?? null,
  );
  const [currentCategorySlug, setCurrentCategorySlug] = useState<string | null>(
    activeCategorySlug ?? null,
  );
  const currentCategorySlugRef = useRef<string | null>(
    activeCategorySlug ?? null,
  );

  useEffect(() => {
    currentCategorySlugRef.current = currentCategorySlug;
  }, [currentCategorySlug]);

  // --- popstate sync (back / forward buttons) -----------------------------

  useEffect(() => {
    function handlePopState() {
      const pathSegments = window.location.pathname
        .replace(/^\/+/, "")
        .split("/")
        .filter(Boolean);

      const baseMatch = baseSegments.every(
        (segment, index) => pathSegments[index] === segment,
      );
      if (!baseMatch) return;

      const categorySlug = pathSegments[baseSegments.length] ?? null;
      const itemSlug = pathSegments[baseSegments.length + 1] ?? null;

      const validCategorySlug =
        categorySlug && categoryBySlug[categorySlug] ? categorySlug : null;

      if (itemSlug && itemLookup[itemSlug]) {
        const derivedCategory =
          validCategorySlug ?? itemToCategorySlug[itemSlug] ?? null;

        setCurrentItemSlug(itemSlug);
        setCurrentCategorySlug(derivedCategory);
        setOpen(true);
      } else {
        setOpen(false);
        setCurrentItemSlug(null);
        setCurrentCategorySlug(validCategorySlug);
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [baseSegments, categoryBySlug, itemLookup, itemToCategorySlug]);

  // Fullscreen detail locks document scroll while open. Previously this
  // ran conditionally on the (now-gone) sheet vs fullscreen split.
  useEffect(() => {
    if (!open) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [open]);

  const currentItem = currentItemSlug ? itemLookup[currentItemSlug] : null;
  const currentCategory = currentCategorySlug
    ? categoryBySlug[currentCategorySlug] ?? null
    : null;

  const imageUrl = currentItem ? getItemImageUrl(currentItem) : null;

  // --- helpers -------------------------------------------------------------

  const buildPath = useCallback((
    categorySlug: string | null | undefined,
    itemSlug: string | null | undefined,
  ) => {
    const categoryPart = categorySlug ? `/${categorySlug}` : "";
    const itemPart = itemSlug ? `/${itemSlug}` : "";
    return `${normalizedBase}${categoryPart}${itemPart}`;
  }, [normalizedBase]);

  const openItem = useCallback((itemSlug: string, categorySlug?: string | null) => {
    const normalizedItemSlug = itemSlug ?? null;
    if (!normalizedItemSlug || !itemLookup[normalizedItemSlug]) return;

    const derivedCategorySlug =
      categorySlug ??
      itemToCategorySlug[normalizedItemSlug] ??
      activeCategorySlug ??
      null;

    const path = buildPath(derivedCategorySlug, normalizedItemSlug);
    const pathWithPreview = appendPreviewSearch(path);

    setCurrentItemSlug(normalizedItemSlug);
    setCurrentCategorySlug(derivedCategorySlug ?? null);
    setOpen(true);

    window.history.pushState(null, "", pathWithPreview);
  }, [
    activeCategorySlug,
    buildPath,
    itemLookup,
    itemToCategorySlug,
  ]);

  const closeItem = useCallback(() => {
    const fallbackCategorySlug =
      currentCategorySlugRef.current ?? activeCategorySlug ?? null;

    const path = buildPath(fallbackCategorySlug, null);
    const pathWithPreview = appendPreviewSearch(path);

    setOpen(false);
    setCurrentItemSlug(null);

    window.history.replaceState(null, "", pathWithPreview);
  }, [activeCategorySlug, buildPath]);

  const ctxValue: ItemSheetContextValue = useMemo(
    () => ({
      openItem,
      closeItem,
    }),
    [closeItem, openItem],
  );

  if (!categoriesWithItems.length) {
    return <>{children}</>;
  }

  return (
    <ItemSheetContext.Provider value={ctxValue}>
      {children}
      {open && currentItem && (
        <div className="fixed inset-0 z-50 bg-black/60 md:flex md:items-center md:justify-center md:p-6">
          <ItemDetailFullscreen
            item={currentItem}
            category={currentCategory}
            imageUrl={imageUrl}
            itemAspectRatio={itemAspectRatio}
            onClose={closeItem}
            currencySettings={currencySettings}
            activeLocale={activeLocale}
            defaultLocale={defaultLocale}
          />
        </div>
      )}
    </ItemSheetContext.Provider>
  );
}

function appendPreviewSearch(path: string): string {
  if (typeof window === "undefined") return path;

  const search = window.location.search;
  if (!search) return path;

  const params = new URLSearchParams(search);
  if (!params.has("preview")) return path;

  return `${path}${search}`;
}

// ---- trigger --------------------------------------------------------------

export function ItemSheetTrigger({
  itemSlug,
  categorySlug,
  children,
}: {
  itemSlug: string;
  categorySlug: string | null;
  children: ReactNode;
}) {
  const { openItem } = useItemSheet();

  return (
    <button
      type="button"
      onClick={() => openItem(itemSlug, categorySlug)}
      className="block w-full text-left"
    >
      {children}
    </button>
  );
}

export function useItemSheet() {
  const ctx = useContext(ItemSheetContext);
  if (!ctx) {
    throw new Error("ItemSheet components must be used inside ItemSheetProvider.");
  }
  return ctx;
}
