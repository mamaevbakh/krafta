"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { LanguagesSidebar, type CatalogLocale } from "./languages-sidebar";
import { ItemsTab, type ItemRow } from "./items-tab";
import { OverviewTab, type OverviewCompleteness } from "./overview-tab";
import { TranslateEverythingButton } from "./translate-everything-button";
import {
  DEFAULT_ITEMS_FILTER,
  classifyTranslation,
  type ItemsFilter,
} from "./items-filter-chips";

/**
 * Localization Workbench — top-level panel.
 *
 * Layout:
 *   - Sticky header: catalog crumb · hero progress band (% translated +
 *     stacked bar + master "Translate everything missing" CTA). The hero
 *     is intentionally persistent across tabs so the merchant feels the
 *     work progressing while editing in Items/etc., and the master CTA
 *     is always one click away.
 *   - Two-pane body: LanguagesSidebar (left) + Tabs (right)
 *   - Tabs:
 *       Overview (default landing — per-language coverage + scope + cost)
 *       Items    (worktable with status × language filter chips)
 *       Catalog / Categories / Variations / Modifiers / Modifier Lists —
 *       all disabled with "Coming in Phase 2" tooltips.
 *
 * The Overview tab's "Find these N" CTAs flip both the active tab AND the
 * Items tab filter chips — so the manual translator gets a one-click path
 * from "I see 23 untranslated Russian items" to a filtered worktable of
 * exactly those 23 items.
 */

export type CompletenessRow = {
  // View columns are returned as nullable by Supabase typegen because
  // PostgREST can't prove a view-derived column is NOT NULL even if the
  // underlying expression is. Treat as nullable at the boundary and fall
  // back to safe defaults inside the panel.
  locale: string | null;
  entity_kind: string | null;
  total: number | null;
  translated: number | null;
  non_stale: number | null;
  missing: number | null;
  stale: number | null;
};

export type Quota = {
  daily_quota: number;
  used_today: number;
  quota_reset_at: string;
};

export type TranslationsPanelProps = {
  catalogId: string;
  catalogSlug: string;
  catalogName: string;
  locales: CatalogLocale[];
  items: ItemRow[];
  completeness: CompletenessRow[];
  quota: Quota | null;
};

export function TranslationsPanel({
  catalogId,
  catalogSlug,
  catalogName,
  locales,
  items,
  completeness,
  quota,
}: TranslationsPanelProps) {
  const router = useRouter();
  // quota is still fetched (drives future cost-tracking surfaces) but the
  // "X today" chip got replaced by the master Translate-Everything CTA per
  // S1c — kept here for future re-use without re-plumbing the page.
  void quota;

  // Default to Overview — the merchant lands on the dashboard, sees state
  // at a glance, then drills into Items when they want to do work.
  const [activeTab, setActiveTab] = React.useState("overview");

  // Filter state lives here so the Overview tab's "Find these N" CTAs can
  // pre-set both axes before switching the merchant to the Items tab.
  // Single source of truth — Items tab is a controlled consumer.
  const [itemsFilter, setItemsFilter] =
    React.useState<ItemsFilter>(DEFAULT_ITEMS_FILTER);

  const refreshAfterMutation = React.useCallback(() => {
    router.refresh();
  }, [router]);

  const enabledLocales = React.useMemo(
    () => locales.filter((l) => l.is_enabled),
    [locales],
  );
  const targetLocales = React.useMemo(
    () => enabledLocales.filter((l) => !l.is_default),
    [enabledLocales],
  );
  const defaultLocale = React.useMemo(
    () => enabledLocales.find((l) => l.is_default) ?? null,
    [enabledLocales],
  );

  // Build per-locale completeness for the Overview tab. We derive
  // "needs review / translated / not translated" directly from the items
  // payload (same classifier the Items tab uses) so the two surfaces never
  // disagree. The completeness VIEW is a useful future signal but its
  // semantics are "AI vs human" not "needs review vs done", so we don't
  // depend on it here.
  const overviewCompleteness = React.useMemo<OverviewCompleteness>(() => {
    const byLocale = new Map<
      string,
      {
        translated: number;
        needsReview: number;
        notTranslated: number;
        total: number;
      }
    >();
    for (const locale of targetLocales) {
      let translated = 0;
      let needsReview = 0;
      let notTranslated = 0;
      for (const item of items) {
        const bucket = classifyTranslation(item, locale.locale);
        if (bucket === "translated") translated += 1;
        else if (bucket === "needs-review") needsReview += 1;
        else notTranslated += 1;
      }
      byLocale.set(locale.locale, {
        translated,
        needsReview,
        notTranslated,
        total: items.length,
      });
    }
    return { byLocale };
  }, [items, targetLocales]);

  // Aggregate totals for the persistent header hero band. Sums per-locale
  // buckets across every target language so the merchant sees "your
  // catalog is X% translated" anywhere in the workbench, not just on the
  // Overview tab.
  const headerTotals = React.useMemo(() => {
    let translated = 0;
    let needsReview = 0;
    let notTranslated = 0;
    let total = 0;
    for (const locale of targetLocales) {
      const row = overviewCompleteness.byLocale.get(locale.locale);
      if (row) {
        translated += row.translated;
        needsReview += row.needsReview;
        notTranslated += row.notTranslated;
        total += row.total;
      } else {
        notTranslated += items.length;
        total += items.length;
      }
    }
    const completePct =
      total === 0 ? 0 : Math.round((translated / total) * 100);
    return { translated, needsReview, notTranslated, total, completePct };
  }, [targetLocales, overviewCompleteness, items.length]);

  // Items pill label — plain "Items", no counter. The header hero band
  // already carries the X/Y count, the % completion, the linear bar AND
  // the donut. Repeating it on the tab strip was visual noise.
  const itemsLabel = "Items";

  // Show the hero band only when there's actual data to summarise.
  // No target languages OR no items → just the breadcrumb on top.
  const showHero = targetLocales.length > 0 && items.length > 0;

  // Overview tab → Items tab navigation. Sets both axes + flips tab.
  const handleJumpToItems = React.useCallback(
    (next: ItemsFilter) => {
      setItemsFilter(next);
      setActiveTab("items");
    },
    [],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full min-h-screen flex-col">
        {/* Dashboard-standard header — matches the layout shipped by the
            Items page (items-panel.tsx) and Categories page
            (categories-panel.tsx): full-width border-b shell, max-w-1248px
            inner container, title left, primary CTA centered on the
            right. Translations carries extra content (subtitle + linear
            progress bar) so the row grows taller than items' fixed
            120px, but the column anchor points stay identical. */}
        {showHero ? (
          <header className="w-full border-b">
            <div className="mx-auto flex h-[120px] max-w-[1248px] items-center justify-between gap-6 px-6">
              {/* Left: title + subtitle. Matches the title block on
                  /items (items-panel.tsx:156-158) and /items/categories
                  — a `space-y-1` container with the dashboard H1. The
                  subtitle survives because the % alone doesn't show
                  scope (rows + languages); items/categories don't
                  carry that signal in their title. */}
              <div className="min-w-0 space-y-1">
                <h1 className="text-[32px] font-semibold leading-tight tracking-tight">
                  Your catalog is {headerTotals.completePct}% translated
                </h1>
                <p className="text-sm text-muted-foreground">
                  {headerTotals.translated} of {headerTotals.total}{" "}
                  translation rows are done across {targetLocales.length}{" "}
                  {targetLocales.length === 1 ? "language" : "languages"}.
                </p>
              </div>

              {/* Right: master CTA. Same slot as "Add item" / "Create
                  category" on the sibling pages. */}
              {headerTotals.notTranslated + headerTotals.needsReview > 0 && (
                <div className="shrink-0">
                  <TranslateEverythingButton
                    catalogId={catalogId}
                    targetLocales={targetLocales}
                    items={items}
                    onEnqueued={refreshAfterMutation}
                  />
                </div>
              )}
            </div>
          </header>
        ) : (
          // Empty-state header — same outer shell as the data state so
          // the page chrome doesn't visually shift when the merchant
          // adds their first language / items. Matches items header
          // height (h-[120px]) since there's no extra content to grow it.
          <header className="w-full border-b">
            <div className="mx-auto flex h-[120px] max-w-[1248px] items-center px-6">
              <div className="space-y-1">
                <h1 className="text-[32px] font-semibold tracking-tight">
                  Translations
                </h1>
                <p className="text-sm text-muted-foreground">
                  Add a target language in the sidebar to get started
                  {catalogName ? ` translating ${catalogName}` : ""}.
                </p>
              </div>
            </div>
          </header>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-0 lg:flex-row">
          <aside className="border-b lg:w-64 lg:border-b-0 lg:border-r">
            <LanguagesSidebar
              catalogId={catalogId}
              catalogSlug={catalogSlug}
              locales={locales}
              onMutation={refreshAfterMutation}
            />
          </aside>

          <main className="min-w-0 flex-1">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex h-full flex-col"
            >
              {/*
                Pill tab strip — mirrors the canvas/table view-toggle treatment:
                rounded-full chrome, high-contrast active segment. Scrolls
                horizontally on narrow viewports so the pill stays a single
                continuous shape; previously the row used flex-wrap which broke
                the pill silhouette as soon as items overflowed.
              */}
              <div className="border-b px-2 py-2 md:px-2">
                <div className="overflow-x-auto">
                  <TabsList
                    className={cn(
                      "inline-flex h-auto gap-1 border rounded-full border-border p-1 py-0",
                      "bg-background/85 shadow-sm backdrop-blur-md",
                    )}
                  >
                    <TabsTrigger
                      value="overview"
                      className={cn(
                        "rounded-full px-3",
                        "data-[state=active]:bg-foreground data-[state=active]:text-background",
                      )}
                    >
                      Overview
                    </TabsTrigger>
                    <TabsTrigger
                      value="items"
                      className={cn(
                        "rounded-full px-3",
                        "data-[state=active]:bg-foreground data-[state=active]:text-background",
                      )}
                    >
                      {itemsLabel}
                    </TabsTrigger>
                    <DisabledTab label="Catalog" reason="Catalog meta (shop name + description) ships in Phase 2 once demand evidence emerges." />
                    <DisabledTab label="Categories" reason="Category translations land in Phase 2 of the workbench." />
                    <DisabledTab label="Variations" reason="Variation translations land in Phase 2 of the workbench." />
                    <DisabledTab label="Modifiers" reason="Modifier translations land in Phase 2, after KRA-85 ships modifier-list CRUD." />
                    <DisabledTab label="Modifier Lists" reason="Same as Modifiers — Phase 2 dependency on KRA-85." />
                  </TabsList>
                </div>
              </div>

              <TabsContent
                value="overview"
                className="flex-1 overflow-auto p-4 md:p-6"
              >
                <OverviewTab
                  catalogId={catalogId}
                  defaultLocale={defaultLocale}
                  targetLocales={targetLocales}
                  items={items}
                  completeness={overviewCompleteness}
                  onJumpToItems={handleJumpToItems}
                  onMutation={refreshAfterMutation}
                />
              </TabsContent>

              <TabsContent
                value="items"
                className="flex-1 overflow-auto p-4 md:p-6"
              >
                {enabledLocales.length <= 1 ? (
                  <NoTargetLocalesEmpty hasDefaultLocale={defaultLocale !== null} />
                ) : (
                  <ItemsTab
                    catalogId={catalogId}
                    defaultLocale={defaultLocale}
                    targetLocales={targetLocales}
                    items={items}
                    filter={itemsFilter}
                    onFilterChange={setItemsFilter}
                    onMutation={refreshAfterMutation}
                  />
                )}
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

// UsageIndicator was removed — the persistent header hero band now
// carries overall progress, and the BorderBeamButton replaces the
// per-day chip. Today's count is still tracked in catalog_translation_
// quotas.used_today for future cost-tracking surfaces.

// ============================================================================
// DisabledTab — visual placeholder for Phase 2 entity kinds
// ============================================================================

function DisabledTab({ label, reason }: { label: string; reason: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            // Match the active TabsTrigger height (Radix renders triggers
            // at h-9 by default) so disabled placeholders sit at the same
            // baseline inside the pill — no half-pixel jog.
            "inline-flex h-9 cursor-not-allowed select-none items-center gap-1.5 rounded-full px-3 text-sm",
            "text-muted-foreground/60",
          )}
          aria-disabled="true"
          role="button"
          tabIndex={-1}
        >
          {label}
          <Badge
            variant="outline"
            className="h-4 rounded-full px-1.5 text-[10px] font-normal"
          >
            Soon
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// Empty state when the merchant hasn't added a target locale yet
// ============================================================================

function NoTargetLocalesEmpty({ hasDefaultLocale }: { hasDefaultLocale: boolean }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <Globe className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-sm font-medium">No target language yet</h2>
      <p className="text-xs text-muted-foreground">
        {hasDefaultLocale ? (
          <>
            Your default language is set. Add another language in the sidebar
            (Russian, Uzbek, English, or any locale code) and we&apos;ll
            translate your menu into it.
          </>
        ) : (
          <>
            This catalog has no languages configured yet. Add a default
            language and at least one target language in the sidebar to get
            started.
          </>
        )}
      </p>
    </div>
  );
}
