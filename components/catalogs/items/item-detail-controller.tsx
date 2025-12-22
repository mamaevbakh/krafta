// components/catalogs/items/item-detail-controller.tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { CategoryWithItems, Item } from "@/lib/catalogs/types";
import type { ItemDetailVariant } from "@/lib/catalogs/settings/layout";
import {
  Drawer,
  DrawerContent,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { ItemDetailSheet } from "@/components/catalogs/items/item-detail-sheet-view";
import { ItemDetailFullscreen } from "@/components/catalogs/items/item-detail-fullscreen-view";

// ---- helpers --------------------------------------------------------------

function getItemImageUrl(item: Item): string | null {
  if (!item.image_path) return null;

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return null;

  return `${baseUrl}/storage/v1/object/public/krafta/${item.image_path}`;
}

// ---- context --------------------------------------------------------------

type ItemSheetContextValue = {
  openItem: (itemSlug: string, categorySlug?: string | null) => void;
  closeItem: () => void;
};

const ItemSheetContext = createContext<ItemSheetContextValue | null>(null);

// ---- provider -------------------------------------------------------------

type ItemSheetProviderProps = {
  categoriesWithItems: CategoryWithItems[];
  activeCategorySlug?: string | null;
  activeItemSlug?: string | null;
  baseHref: string;
  children: ReactNode;
  itemAspectRatio?: number;
  itemDetailVariant?: ItemDetailVariant;
};

export function ItemSheetProvider({
  categoriesWithItems,
  activeCategorySlug = null,
  activeItemSlug = null,
  baseHref,
  children,
  itemAspectRatio,
  itemDetailVariant = "item-sheet",
}: ItemSheetProviderProps) {
  const ItemDetailComponent =
    itemDetailVariant === "item-fullscreen"
      ? ItemDetailFullscreen
      : ItemDetailSheet;
  const itemDetailDrawerClassName =
    itemDetailVariant === "item-fullscreen"
      ? "h-[100dvh] p-0"
      : undefined;
  const normalizedBase = useMemo(
    () => baseHref.replace(/\/+$/, "") || "/",
    [baseHref],
  );

  // --- lookup maps ---------------------------------------------------------

  const itemLookup = useMemo(() => {
    const map: Record<string, Item> = {};
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
    const map: Record<string, CategoryWithItems> = {};
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

  // --- initial link hydration (deep links) ---------------------------------

  useEffect(() => {
    if (activeItemSlug && itemLookup[activeItemSlug]) {
      const derivedCategory =
        activeCategorySlug ?? itemToCategorySlug[activeItemSlug] ?? null;

      setCurrentItemSlug(activeItemSlug);
      setCurrentCategorySlug(derivedCategory);
      setOpen(true);
    }
  }, [activeCategorySlug, activeItemSlug, itemLookup, itemToCategorySlug]);

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

  if (!categoriesWithItems.length) {
    return <>{children}</>;
  }

  const currentItem = currentItemSlug ? itemLookup[currentItemSlug] : null;
  const currentCategory = currentCategorySlug
    ? categoryBySlug[currentCategorySlug] ?? null
    : null;

  const imageUrl = currentItem ? getItemImageUrl(currentItem) : null;

  // --- helpers -------------------------------------------------------------

  function buildPath(
    categorySlug: string | null | undefined,
    itemSlug: string | null | undefined,
  ) {
    const categoryPart = categorySlug ? `/${categorySlug}` : "";
    const itemPart = itemSlug ? `/${itemSlug}` : "";
    return `${normalizedBase}${categoryPart}${itemPart}`;
  }

  function openItem(itemSlug: string, categorySlug?: string | null) {
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
  }

  function closeItem() {
    const fallbackCategorySlug =
      currentCategorySlug ?? activeCategorySlug ?? null;

    const path = buildPath(fallbackCategorySlug, null);
    const pathWithPreview = appendPreviewSearch(path);

    setOpen(false);
    setCurrentItemSlug(null);

    window.history.replaceState(null, "", pathWithPreview);
  }

  const ctxValue: ItemSheetContextValue = {
    openItem,
    closeItem,
  };

  if (itemDetailVariant === "item-fullscreen") {
    useEffect(() => {
      if (!open) return;
      const previousBodyOverflow = document.body.style.overflow;
      const previousHtmlOverflow =
        document.documentElement.style.overflow;

      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";

      return () => {
        document.body.style.overflow = previousBodyOverflow;
        document.documentElement.style.overflow =
          previousHtmlOverflow;
      };
    }, [open]);

    return (
      <ItemSheetContext.Provider value={ctxValue}>
        {children}
        {open && currentItem && (
          <div className="fixed inset-0 z-50 bg-black/60 md:flex md:items-center md:justify-center md:p-6">
            <ItemDetailComponent
              item={currentItem}
              category={currentCategory}
              imageUrl={imageUrl}
              itemAspectRatio={itemAspectRatio}
              onClose={closeItem}
            />
          </div>
        )}
      </ItemSheetContext.Provider>
    );
  }

  return (
    <ItemSheetContext.Provider value={ctxValue}>
      {children}

      <Drawer
        open={open && !!currentItem}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeItem();
          }
        }}
      >
      <DrawerContent
        className={cn(
          "bg-background px-0 pb-4 pt-2 sm:px-0",
          itemDetailDrawerClassName,
        )}
      >
        {currentItem && (
          <ItemDetailComponent
            item={currentItem}
            category={currentCategory}
            imageUrl={imageUrl}
            itemAspectRatio={itemAspectRatio}
          />
        )}
      </DrawerContent>
      </Drawer>
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

function useItemSheet() {
  const ctx = useContext(ItemSheetContext);
  if (!ctx) {
    throw new Error("ItemSheet components must be used inside ItemSheetProvider.");
  }
  return ctx;
}
