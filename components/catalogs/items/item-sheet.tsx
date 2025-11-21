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
  DrawerClose,
} from "@/components/ui/drawer";

type ItemSheetContextValue = {
  openItem: (itemSlug: string, categorySlug?: string | null) => void;
  closeItem: () => void;
};

const ItemSheetContext = createContext<ItemSheetContextValue | null>(null);

type ItemSheetProviderProps = {
  categoriesWithItems: CategoryWithItems[];
  activeCategorySlug?: string | null;
  activeItemSlug?: string | null;
  baseHref: string;
  children: ReactNode;
};

export function ItemSheetProvider({
  categoriesWithItems,
  activeCategorySlug = null,
  activeItemSlug = null,
  baseHref,
  children,
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
    // if no valid item – leave closed
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
        // no item in URL ⇒ just category (or all)
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
        {/* We rely on Drawer’s internal portal – no document.body usage */}
        <DrawerContent className="max-h-[85vh] rounded-t-2xl border-t bg-background px-4 pb-6 pt-4 sm:rounded-2xl sm:px-6 sm:pb-6">
          {currentItem && (
            <>
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

              {/* Later: price, photo, actions, etc. */}
            </>
          )}
        </DrawerContent>
      </Drawer>
    </ItemSheetContext.Provider>
  );
}

// Trigger wrapper for item cards
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