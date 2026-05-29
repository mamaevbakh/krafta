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
import { ItemDetailSkeleton } from "@/components/catalogs/items/item-detail-skeleton";

// S6 (2026-05-25): the legacy bottom-sheet variant is gone — fullscreen
// is the only render mode. The variant prop on the provider stays for
// backward compatibility with callers that still pass it (RSC catalog
// layout, preview page) but is otherwise unused.
//
// `loading: ItemDetailSkeleton` overrides the default Suspense fallback.
// Without it, the dynamic chunk fetch suspends to the nearest Suspense
// boundary — the page-level loading.tsx — which flashes the whole
// CATALOG skeleton over the catalog for ~350ms the FIRST time any item
// detail opens. The dedicated skeleton renders INSIDE the dialog
// overlay with the detail's exact shape (image band + title/price +
// modifier rows + sticky CTA), so the open feels instant and there's
// zero layout shift when the real component lands. Subsequent opens
// are one-frame instant once the chunk is cached.
const ItemDetailFullscreen = dynamic(
  () =>
    import("@/components/catalogs/items/item-detail-fullscreen-view").then(
      (module) => module.ItemDetailFullscreen,
    ),
  { loading: ItemDetailSkeleton },
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

    // `{ __NA: true }` tells Next 16's patched pushState to skip the
    // ACTION_RESTORE dispatch (see next/dist/client/components/
    // app-router.js). Without it, every detail open re-renders the
    // catch-all [...slug] route, which flashes loading.tsx for ~350ms
    // while the new RSC payload is fetched. We manage the dialog and
    // URL ourselves; Next.js doesn't need to react.
    window.history.pushState({ __NA: true }, "", pathWithPreview);
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

    // `{ __NA: true }` keeps Next 16 from treating this as a navigation —
    // see matching note in openItem above.
    window.history.replaceState({ __NA: true }, "", pathWithPreview);
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

  // div + role=button (not a literal <button>) so descendants can include
  // their own interactive controls (the catalog-card cart actions live
  // inside this trigger so they can position absolutely over the photo).
  // Nested literal <button>s inside a <button> would be invalid HTML and
  // produce hydration warnings.
  //
  // Click suppression for opt-out zones: any descendant marked with
  // `data-cart-action` (the Add pill, the stepper) is treated as a
  // non-trigger zone — taps there mutate the cart instead of opening
  // the item detail. More reliable than e.stopPropagation across
  // React's delegated event chain.
  //
  // Portal escape: descendants like the customisations vaul-drawer are
  // *DOM-portaled to body* but stay React-descendants of this trigger,
  // so their overlay clicks synthetically bubble up through us and fire
  // openItem (closing the disambiguation drawer would open the item
  // detail underneath). Guard with `currentTarget.contains(target)` —
  // portaled elements aren't DOM descendants, so the check rejects them
  // even though the React event still bubbles here.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest("[data-cart-action]")) return;
        if (target && !e.currentTarget.contains(target)) return;
        openItem(itemSlug, categorySlug);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          const target = e.target as HTMLElement | null;
          if (target?.closest("[data-cart-action]")) return;
          if (target && !e.currentTarget.contains(target)) return;
          e.preventDefault();
          openItem(itemSlug, categorySlug);
        }
      }}
      className="block w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {children}
    </div>
  );
}

export function useItemSheet() {
  const ctx = useContext(ItemSheetContext);
  if (!ctx) {
    throw new Error("ItemSheet components must be used inside ItemSheetProvider.");
  }
  return ctx;
}
