// components/catalogs/navbars/category-nav-tabs-motion.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import type { CategoryNavProps } from "@/lib/catalogs/layout-registry";
import { cn } from "@/lib/utils";

const TOP_OFFSET_PX = 60;
const ALL_SCROLL_Y = 100;
const UNLOCK_FALLBACK_MS = 800;

type SectionEntry = { slug: string; el: HTMLElement };

function getSlug(category: { slug: string | null; id: string }) {
  return category.slug ?? String(category.id);
}

function getInitialActiveSlug(
  categories: CategoryNavProps["categories"],
  activeCategoryId: string | null,
  activeCategorySlug: string | null,
) {
  const fromId =
    categories.find((category) => category.id === activeCategoryId)?.slug ??
    null;
  const slugValid = activeCategorySlug
    ? categories.some(
        (category) => getSlug(category) === activeCategorySlug,
      )
    : false;
  return slugValid ? activeCategorySlug : fromId;
}

function useStickySentinel(id: string) {
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = document.getElementById(id);
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [id]);

  return isStuck;
}

function useScrollLock(timeoutMs: number) {
  const lockRef = useRef(false);
  const unlockTimerRef = useRef<number | null>(null);

  const lock = useCallback(() => {
    lockRef.current = true;
    if (unlockTimerRef.current !== null) {
      window.clearTimeout(unlockTimerRef.current);
    }
    unlockTimerRef.current = window.setTimeout(() => {
      lockRef.current = false;
      unlockTimerRef.current = null;
    }, timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current !== null) {
        window.clearTimeout(unlockTimerRef.current);
      }
    };
  }, []);

  return { lockRef, lock };
}

function useCenterActiveTab(
  navRef: React.RefObject<HTMLDivElement | null>,
  activeSlug: string | null,
) {
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const slug = activeSlug ?? "all";
    const activeButton = nav.querySelector<HTMLElement>(
      `[data-category="${slug}"]`,
    );
    if (!activeButton) return;

    const containerWidth = nav.clientWidth;
    const maxScrollLeft = nav.scrollWidth - containerWidth;
    if (maxScrollLeft <= 0) return;

    const targetCenter =
      activeButton.offsetLeft +
      activeButton.offsetWidth / 2 -
      containerWidth / 2;
    const next = Math.min(Math.max(targetCenter, 0), maxScrollLeft);

    if (Math.abs(nav.scrollLeft - next) < 2) return;
    nav.scrollTo({ left: next, behavior: "smooth" });
  }, [activeSlug, navRef]);
}

function useScrollActiveCategory(
  slugs: string[],
  setActive: (slug: string | null) => void,
  lockRef: React.MutableRefObject<boolean>,
) {
  useEffect(() => {
    const entries: SectionEntry[] = [];
    for (const slug of slugs) {
      const el = document.getElementById(`category-${slug}`);
      if (el) entries.push({ slug, el });
    }

    if (!entries.length) return;

    const ratios = new Map<string, number>();
    let raf = 0;

    const pickBest = () => {
      raf = 0;
      if (lockRef.current) return;

      if (window.scrollY <= ALL_SCROLL_Y) {
        setActive(null);
        return;
      }

      let bestSlug: string | null = null;
      let bestRatio = 0;

      for (const { slug } of entries) {
        const r = ratios.get(slug) ?? 0;
        if (r > bestRatio) {
          bestRatio = r;
          bestSlug = slug;
        }
      }

      if (bestSlug) setActive(bestSlug);
    };

    const observer = new IntersectionObserver(
      (obsEntries) => {
        for (const entry of obsEntries) {
          const slug = (entry.target as HTMLElement).id.replace(
            /^category-/,
            "",
          );
          ratios.set(slug, entry.intersectionRatio);
        }
        if (raf) return;
        raf = window.requestAnimationFrame(pickBest);
      },
      {
        root: null,
        rootMargin: `-${TOP_OFFSET_PX}px 0px -40% 0px`,
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const { el } of entries) observer.observe(el);
    pickBest();

    return () => {
      observer.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [lockRef, setActive, slugs]);
}

export function CategoryNavTabsMotion({
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

  const slugs = useMemo(
    () => categories.map(getSlug),
    [categories],
  );

  const initialActiveSlug = useMemo(
    () =>
      getInitialActiveSlug(
        categories,
        activeCategoryId,
        activeCategorySlug,
      ),
    [activeCategoryId, activeCategorySlug, categories],
  );

  const [currentSlug, setCurrentSlug] = useState<string | null>(
    initialActiveSlug,
  );
  const lastActiveRef = useRef<string | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);
  const { lockRef, lock } = useScrollLock(UNLOCK_FALLBACK_MS);
  const isStuck = useStickySentinel("catalog-category-nav-sentinel");

  const buildPath = useCallback(
    (slug: string | null) =>
      slug ? `${normalizedBase}/${slug}` : normalizedBase,
    [normalizedBase],
  );

  const setActive = useCallback((slug: string | null) => {
    if (lastActiveRef.current === slug) return;
    lastActiveRef.current = slug;
    setCurrentSlug((prev) => (prev === slug ? prev : slug));
  }, []);

  const scrollToCategory = useCallback((slug: string | null) => {
    if (!slug) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const el = document.getElementById(`category-${slug}`);
    if (!el) return;

    const y =
      el.getBoundingClientRect().top +
      window.scrollY -
      TOP_OFFSET_PX;
    window.scrollTo({ top: y, behavior: "smooth" });
  }, []);

  const handleCategoryClick = useCallback(
    (slug: string | null) => {
      lock();
      setActive(slug);
      scrollToCategory(slug);
      window.history.replaceState(null, "", buildPath(slug));
    },
    [buildPath, lock, scrollToCategory, setActive],
  );

  useEffect(() => {
    setCurrentSlug((prev) =>
      prev === initialActiveSlug ? prev : initialActiveSlug,
    );
    lastActiveRef.current = initialActiveSlug;
  }, [initialActiveSlug]);

  useEffect(() => {
    if (!activeCategorySlug) return;
    const handle = window.requestAnimationFrame(() => {
      scrollToCategory(activeCategorySlug);
    });
    return () => window.cancelAnimationFrame(handle);
  }, [activeCategorySlug, scrollToCategory]);

  useCenterActiveTab(navRef, currentSlug);
  useScrollActiveCategory(slugs, setActive, lockRef);

  const activeSlug = currentSlug ?? "all";

  return (
    <>
      <div
        id="catalog-category-nav-sentinel"
        aria-hidden="true"
        className="h-px"
      />

      <div
        className={cn(
          "sticky top-0 z-30 -mx-4 bg-background/90 dark:bg-secondary-background/90 backdrop-blur",
          isStuck ? "border-b border-border" : "border-b border-transparent",
        )}
      >
        <nav
          ref={navRef}
          className="no-scrollbar flex gap-2 overflow-x-auto pb-2 pt-2 px-4"
        >
          {[
            { id: "all", label: "Все", slug: null as string | null },
            ...categories.map((category) => ({
              id: category.id,
              label: category.name,
              slug: getSlug(category),
            })),
          ].map((tab) => {
            const slugValue = tab.slug ?? "all";
            const isActive = slugValue === activeSlug;
            return (
              <button
                key={tab.id}
                type="button"
                data-category={slugValue}
                onClick={() => handleCategoryClick(tab.slug)}
                className={cn(
                  "relative whitespace-nowrap rounded-xs border px-3 py-1 text-sm transition",
                  isActive
                    ? "border-transparent text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="catalog-tabs-pill"
                    className="absolute inset-0 rounded-xs bg-foreground"
                    transition={{
                      type: "spring",
                      stiffness: 380,
                      damping: 26,
                      mass: 0.2,
                    }}
                  />
                )}
                <span
                  className={cn(
                    "relative z-10",
                    isActive
                      ? "text-background"
                      : "text-muted-foreground",
                  )}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
