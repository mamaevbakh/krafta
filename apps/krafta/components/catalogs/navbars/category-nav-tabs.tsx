// components/catalogs/navbars/category-nav-tabs.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CategoryNavProps } from "@/lib/catalogs/layout-registry";
import { pickLocalizedField } from "@/lib/catalogs/i18n";
import { getStorefrontMessage } from "@/lib/locales/messages";
import { cn } from "@/lib/utils";
import { ProgressiveBlur } from "@/components/catalogs/progressive-blur";

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

export function CategoryNavTabs({
  categories,
  activeCategoryId = null,
  activeCategorySlug = null,
  baseHref,
  activeLocale,
  defaultLocale,
}: CategoryNavProps) {
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
  // Remembers the last prop-derived initial slug so we can detect when it
  // changes and reset the selection during render (see below).
  const [prevInitialActiveSlug, setPrevInitialActiveSlug] = useState<
    string | null | undefined
  >(undefined);
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

  // Reset the active selection when the prop-derived initial slug changes
  // (e.g. client-side nav to a different catalog/category). Adjusting state
  // during render is React's recommended alternative to a setState effect:
  // https://react.dev/learn/you-might-not-need-an-effect
  if (prevInitialActiveSlug !== initialActiveSlug) {
    setPrevInitialActiveSlug(initialActiveSlug);
    setCurrentSlug(initialActiveSlug);
  }

  // Keep the scroll-dedupe ref aligned with the initial slug. Ref writes
  // belong in an effect rather than in render.
  useEffect(() => {
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

  if (!categories.length) return null;

  return (
    <>
      <div
        id="catalog-category-nav-sentinel"
        aria-hidden="true"
        className="h-px"
      />

      <div
        className={cn(
          // top offset clears the Telegram status bar + floating controls in
          // the Mini App (--tg-safe-top); resolves to 0 on the public web.
          "sticky top-[var(--tg-safe-top,0px)] z-30 -mx-4",
          isStuck ? "border-b border-border" : "border-b border-transparent",
        )}
      >
        {/* Chrome surface behind the tabs, fading out below. When stuck it
            extends UP through the safe area to the very top of the screen
            (behind the Telegram status bar + controls); at rest it only backs
            the tab strip. (--tg-safe-top resolves to 0 on the web.) */}
        <ProgressiveBlur
          className={cn(
            "absolute inset-x-0",
            isStuck
              ? "top-[calc(-1_*_var(--tg-safe-top,0px))] h-[calc(100%_+_var(--tg-safe-top,0px)_+_1rem)]"
              : "top-0 h-[calc(100%_+_1rem)]",
          )}
        />
        <nav
          ref={navRef}
          className="relative z-10 no-scrollbar flex gap-2 overflow-x-auto pb-2 pt-2 px-4"
        >
          <button
            type="button"
            data-category="all"
            onClick={() => handleCategoryClick(null)}
            className={cn(
              "inline-flex min-h-11 items-center whitespace-nowrap rounded-xs border px-3 py-1 text-sm transition sm:min-h-9",
              currentSlug === null
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
            )}
          >
            {getStorefrontMessage("all", { activeLocale, defaultLocale })}
          </button>

          {categories.map((category) => {
            const slug = getSlug(category);
            const isActive = slug === currentSlug;
            const label = pickLocalizedField({
              translations: category.translations,
              defaults: {
                name: category.name,
                description: category.description ?? null,
                image_alt: null,
              },
              activeLocale,
              defaultLocale,
              field: "name",
            }).value;

            return (
              <button
                key={category.id}
                type="button"
                data-category={slug}
                onClick={() => handleCategoryClick(slug)}
                className={cn(
                  "inline-flex min-h-11 items-center whitespace-nowrap rounded-xs border px-3 py-1 text-sm transition sm:min-h-9",
                  isActive
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
