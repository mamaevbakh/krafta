// components/catalogs/items/item-sheet.tsx
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
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import Image from "next/image";

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
};

export function ItemSheetProvider({
  categoriesWithItems,
  activeCategorySlug = null,
  activeItemSlug = null,
  baseHref,
  children,
  itemAspectRatio
}: ItemSheetProviderProps) {
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

    setCurrentItemSlug(normalizedItemSlug);
    setCurrentCategorySlug(derivedCategorySlug ?? null);
    setOpen(true);

    const path = buildPath(derivedCategorySlug, normalizedItemSlug);
    window.history.pushState(null, "", path);
  }

  function closeItem() {
    const fallbackCategorySlug =
      currentCategorySlug ?? activeCategorySlug ?? null;

    setOpen(false);
    setCurrentItemSlug(null);

    const path = buildPath(fallbackCategorySlug, null);
    window.history.replaceState(null, "", path);
  }

  const ctxValue: ItemSheetContextValue = {
    openItem,
    closeItem,
  };

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
        <DrawerContent className="bg-background px-0 pb-4 pt-2 sm:px-0">
          {currentItem && (
            <div className="mx-auto mt-3 flex h-[80vh] max-w-sm flex-col gap-4 overflow-y-auto px-4 sm:px-6">
              {imageUrl && (
                <AspectRatio
                  ratio={itemAspectRatio ?? 4 / 3}// ✅ always defined here
                  className="w-full overflow-hidden rounded-lg bg-muted"
                >
                  <Image
                    src={imageUrl}
                    alt={currentItem.name ?? ""}
                    fill
                    className="h-full w-full object-cover dark:brightness-[0.9]"
                  />
                </AspectRatio>
              )}

              <DrawerHeader className="flex flex-row items-start justify-between gap-3 px-0">
                <div className="space-y-1">
                  {currentCategory ? (
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {currentCategory.name}
                    </p>
                  ) : null}

                  <DrawerTitle className="text-lg">
                    {currentItem.name}
                  </DrawerTitle>

                  {currentItem.description && (
                    <DrawerDescription className="text-sm text-muted-foreground">
                      {currentItem.description}
                    </DrawerDescription>
                  )}
                </div>
              </DrawerHeader>

              {/* later: price, options, etc. */}
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </ItemSheetContext.Provider>
  );
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