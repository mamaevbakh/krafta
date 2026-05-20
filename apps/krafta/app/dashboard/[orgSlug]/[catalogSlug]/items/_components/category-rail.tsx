"use client";

/**
 * category-rail.tsx — KRA-35 Iter 2 / T3: left-side anchor list of categories.
 *
 * Per design plan §3 D4.2 + Pass 1 D1A: a subordinate-inset vertical list
 * of category names that sits in the canvas page's left padding. Click a
 * name → smooth-scrolls to that CategorySection's anchor (rooted via
 * data-category-id). Hidden on mobile and on narrow desktops (≤xl breakpoint
 * which is 1280px — close to the design plan's 1366px floor).
 *
 * Visual integration (Pass 1 D1A):
 *   - No border-r (would compete with the dashboard sidebar visually)
 *   - bg-background (no separate surface color)
 *   - Lives inside the page's flex row layout, in the gap between the
 *     dashboard sidebar and the canvas content. Eye reads it as "document
 *     gutter," not as new chrome.
 *
 * Active-section highlight via IntersectionObserver scroll-spy. The category
 * whose section is most-visible in the viewport gets the active class
 * (bg-accent + text-foreground). Without this, the rail is a static list
 * that doesn't track where the merchant is in the page — useful but less
 * polished.
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import type { CatalogCategory } from "@/lib/catalogs/types";

export type CategoryRailProps = {
  categories: CatalogCategory[];
  /** Whether the orphans (Uncategorized) bucket has items. When true, the
   *  rail surfaces an extra "Uncategorized" anchor at the bottom. */
  hasOrphans: boolean;
};

export function CategoryRail({ categories, hasOrphans }: CategoryRailProps) {
  const sortedCategories = React.useMemo(
    () => [...categories].sort((a, b) => a.position - b.position),
    [categories],
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);

  // IntersectionObserver scroll-spy. Observes every CategorySection's root
  // (rooted via `[data-category-id]`) and tracks which one is most in view.
  // Re-runs the observer when categories change (e.g. a new category added).
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-category-id]"),
    );
    if (sections.length === 0) return;

    // Build a Map of id → IntersectionObserverEntry so we can pick the
    // most-visible section on each observer fire.
    const visible = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute("data-category-id");
          if (!id) continue;
          if (entry.isIntersecting) {
            visible.set(id, entry.intersectionRatio);
          } else {
            visible.delete(id);
          }
        }

        // Pick the section with the highest intersection ratio.
        let topId: string | null = null;
        let topRatio = 0;
        for (const [id, ratio] of visible) {
          if (ratio > topRatio) {
            topId = id;
            topRatio = ratio;
          }
        }
        setActiveId(topId);
      },
      {
        // Trigger when at least 10% of the section is visible. Multiple
        // thresholds let us track the active section more smoothly as it
        // scrolls — single-threshold observers can jitter at boundaries.
        threshold: [0.1, 0.25, 0.5, 0.75],
        // Offset the top so the rail doesn't activate a section the moment
        // its top edge crosses the viewport — wait until it's actually
        // showing content. 80px ≈ the sticky page header height.
        rootMargin: "-80px 0px 0px 0px",
      },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [categories]);

  const handleClick = React.useCallback((categoryId: string) => {
    const section = document.querySelector<HTMLElement>(
      `[data-category-id="${categoryId}"]`,
    );
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <aside
      data-slot="category-rail"
      // Hidden below xl (1280px) — matches the design plan's "≤1366px hide
      // rail" intent within Tailwind's default breakpoints. Mobile (< md)
      // would already be hidden by this rule.
      // Sticky positioning so the rail tracks the viewport on scroll.
      // self-start so it doesn't stretch to the canvas's full height (a
      // sticky element inside flex stretches by default — counterintuitive).
      className="sticky top-[80px] hidden h-fit w-[180px] shrink-0 flex-col gap-0.5 self-start xl:flex"
    >
      <h3 className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Categories
      </h3>

      {sortedCategories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => handleClick(category.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-left text-sm transition-colors",
            "text-muted-foreground hover:bg-accent hover:text-foreground",
            // Active section: filled accent background + foreground text.
            // Subtle enough to read as "you are here," not loud.
            activeId === category.id && "bg-accent text-foreground",
          )}
        >
          <span className="block truncate">{category.name}</span>
        </button>
      ))}

      {hasOrphans && (
        <button
          type="button"
          onClick={() => handleClick("__orphans__")}
          className={cn(
            "rounded-md px-3 py-1.5 text-left text-sm transition-colors",
            "text-muted-foreground hover:bg-accent hover:text-foreground",
            activeId === "__orphans__" && "bg-accent text-foreground",
          )}
        >
          <span className="block truncate italic">Uncategorized</span>
        </button>
      )}
    </aside>
  );
}
