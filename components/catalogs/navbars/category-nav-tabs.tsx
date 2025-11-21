// components/catalogs/navbars/category-nav-tabs.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { CategoryNavProps } from "@/lib/catalogs/layout-registry";

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

  useEffect(() => {
    if (!activeCategorySlug) return;

    const handle = window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `#category-${activeCategorySlug}`,
      );

      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
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
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function handleCategoryClick(categorySlug: string | null) {
    setCurrentSlug(categorySlug);
    scrollToCategory(categorySlug);
    updateUrl(categorySlug);
  }

  return (
    <nav className="flex gap-2 overflow-x-auto pb-1">
      <button
        type="button"
        onClick={() => handleCategoryClick(null)}
        className={[
          "whitespace-nowrap rounded-full border px-3 py-1 text-sm transition",
          currentSlug === null
            ? "border-foreground bg-foreground text-background"
            : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
        ].join(" ")}
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
            className={[
              "whitespace-nowrap rounded-full border px-3 py-1 text-sm transition",
              isActive
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
            ].join(" ")}
          >
            {category.name}
          </button>
        );
      })}
    </nav>
  );
}
