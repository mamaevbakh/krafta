// components/catalogs/navbars/category-nav-tabs.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { CategoryNavProps } from "@/lib/catalogs/layout-registry";
import { cn } from "@/lib/utils";

export function CategoryNavTabs({
  categories,
  activeCategoryId = null,
  activeCategorySlug = null,
  baseHref,
}: CategoryNavProps) {
  if (!categories.length) return null;

  const normalizedBase = useMemo(
    () => baseHref.replace(/\/+$/, "") || "/",
    [baseHref],
  );

  const initialActiveSlug = useMemo(() => {
    const resolvedFromId =
      categories.find((category) => category.id === activeCategoryId)?.slug ??
      null;

    const hasActiveSlug = activeCategorySlug
      ? categories.some(
          (category) =>
            (category.slug ?? String(category.id)) === activeCategorySlug,
        )
      : false;

    if (hasActiveSlug) return activeCategorySlug;
    return resolvedFromId;
  }, [activeCategoryId, activeCategorySlug, categories]);

  const [currentSlug, setCurrentSlug] = useState<string | null>(
    initialActiveSlug,
  );

  // track if bar is actually stuck at top
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = document.getElementById("catalog-category-nav-sentinel");
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // when sentinel leaves viewport → nav is now sticky
        setIsStuck(!entry.isIntersecting);
      },
      {
        threshold: 1,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Scroll into view on first load if we have activeCategorySlug from URL
  useEffect(() => {
    if (!activeCategorySlug) return;

    const handle = window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `#category-${activeCategorySlug}`,
      );

      if (el) {
    const y =
      el.getBoundingClientRect().top +
      window.scrollY -
      60; // <--- OFFSET IN PX

    window.scrollTo({
      top: y,
      behavior: "smooth",
    });
  }
    });

    return () => window.cancelAnimationFrame(handle);
  }, [activeCategorySlug]);

  function updateUrl(categorySlug: string | null) {
    const newPath = categorySlug
      ? `${normalizedBase}/${categorySlug}`
      : normalizedBase;

    window.history.replaceState(null, "", newPath);
  }

  function scrollToCategory(categorySlug: string | null) {
    if (!categorySlug) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const el = document.querySelector<HTMLElement>(
      `#category-${categorySlug}`,
    );

    if (el) {
    const y =
      el.getBoundingClientRect().top +
      window.scrollY -
      60; // <--- OFFSET IN PX

    window.scrollTo({
      top: y,
      behavior: "smooth",
    });
  }
  }

  function handleCategoryClick(categorySlug: string | null) {
    setCurrentSlug(categorySlug);
    scrollToCategory(categorySlug);
    updateUrl(categorySlug);
  }

  return (
    <>
      {/* Sentinel used only to detect when the nav becomes sticky */}
      <div
        id="catalog-category-nav-sentinel"
        aria-hidden="true"
        className="h-0"
      />

      {/* Sticky container */}
      <div
        className={cn(
          "sticky top-0 z-30 -mx-4 bg-background/90 dark:bg-secondary-background/90 backdrop-blur",
          isStuck
            ? "border-b border-border"
            : "border-b border-transparent",
        )}
      >
        <nav className="flex gap-2 overflow-x-auto pb-2 pt-2 px-4">
          <button
            type="button"
            onClick={() => handleCategoryClick(null)}
            className={cn(
              "whitespace-nowrap rounded-xs border px-3 py-1 text-sm transition",
              currentSlug === null
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
            )}
          >
            All
          </button>

          {categories.map((category) => {
            const slug = category.slug ?? String(category.id);
            const isActive = slug === currentSlug;

            return (
              <button
                key={category.id}
                type="button"
                onClick={() => handleCategoryClick(slug)}
                className={cn(
                  "whitespace-nowrap rounded-xs border px-3 py-1 text-sm transition",
                  isActive
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                )}
              >
                {category.name}
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}