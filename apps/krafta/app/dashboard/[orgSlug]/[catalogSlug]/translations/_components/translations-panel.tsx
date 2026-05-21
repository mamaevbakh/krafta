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
  EntityTranslationsTab,
  type EntityRowForTable,
} from "./entity-translations-tab";
import {
  useTranslationRealtime,
  type ActiveJob,
} from "./use-translation-realtime";
import { useAnimatedNumber } from "@/lib/hooks/use-animated-number";
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
  /** KRA-94 Phase 2 entity payloads — each is the source row + its nested
   *  translation rows, already flattened by the RSC fetch. The four arrays
   *  share the same EntityRowForTable shape so the generic
   *  EntityTranslationsTab can consume them directly. */
  categories: EntityRowForTable[];
  variations: EntityRowForTable[];
  modifiers: EntityRowForTable[];
  modifierLists: EntityRowForTable[];
  completeness: CompletenessRow[];
  quota: Quota | null;
};

export function TranslationsPanel({
  catalogId,
  catalogSlug,
  catalogName,
  locales,
  items,
  categories,
  variations,
  modifiers,
  modifierLists,
  completeness,
  quota,
}: TranslationsPanelProps) {
  const router = useRouter();
  // quota + completeness are still fetched (drive future cost-tracking and
  // server-side completeness signal surfaces) but the current header reads
  // its numbers from classifyTranslation so the Overview and Items tabs
  // never disagree. Kept on the props so the RSC payload stays stable when
  // those surfaces light up.
  void quota;
  void completeness;

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
        notTranslated: number;
        total: number;
      }
    >();
    for (const locale of targetLocales) {
      let translated = 0;
      let notTranslated = 0;
      for (const item of items) {
        const bucket = classifyTranslation(item, locale.locale);
        if (bucket === "translated") translated += 1;
        else notTranslated += 1;
      }
      byLocale.set(locale.locale, {
        translated,
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
    let notTranslated = 0;
    let total = 0;
    for (const locale of targetLocales) {
      const row = overviewCompleteness.byLocale.get(locale.locale);
      if (row) {
        translated += row.translated;
        notTranslated += row.notTranslated;
        total += row.total;
      } else {
        notTranslated += items.length;
        total += items.length;
      }
    }
    const completePct =
      total === 0 ? 0 : Math.round((translated / total) * 100);
    return { translated, notTranslated, total, completePct };
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

  // Realtime: subscribe to translation_jobs + item_translations for
  // this catalog. The hook exposes activeJobs (drives the "AI
  // translating…" pulse) and recentlyUpdated (drives the row
  // highlight in ItemsTab). onTranslationChange is debounced inside
  // the hook so a 200-row bulk translate doesn't cause 200 router
  // refreshes — one fan-out covers the burst.
  const itemIdSet = React.useMemo(
    () => new Set(items.map((i) => i.id)),
    [items],
  );
  const { activeJobs, recentlyUpdated, hasActivity } = useTranslationRealtime({
    catalogId,
    itemIds: itemIdSet,
    onTranslationChange: refreshAfterMutation,
  });

  // Per-locale busy map for the per-language TranslateAllButton in the
  // Overview cards. Each card disables its own AI button when its
  // target language has an in-flight job, so the merchant can't stack
  // a second batch on top of the running one.
  const busyLocales = React.useMemo(() => {
    const set = new Set<string>();
    for (const j of activeJobs) set.add(j.targetLocale);
    return set;
  }, [activeJobs]);

  // Animate the % counter and the X / Y fraction so the header reads
  // as "alive" when the worker lands a translation: 3% → 4% tweens
  // rather than snaps. ease-out cubic, 400ms — see useAnimatedNumber.
  const animatedPct = useAnimatedNumber(headerTotals.completePct);
  const animatedTranslated = useAnimatedNumber(headerTotals.translated);

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
        {(() => {
          // Three header states, in order of restraint:
          //   1. Fully translated + no AI in flight → just "Translations".
          //      Matches the items/categories pattern exactly. Quiet
          //      chrome reads as "you're done, nothing to do here."
          //   2. In progress → "Your catalog is X% translated" + subtitle
          //      + master CTA. The narrative title earns its weight
          //      because the merchant has work to do.
          //   3. No data yet (no target languages, no items) → just
          //      "Translations" + a help line pointing at the sidebar.
          //
          // Gate (1) on hasActivity too so we don't flicker to the quiet
          // state during the brief window where the worker has written
          // the last row but hasn't yet marked the job 'done'.
          const isFullyTranslated =
            showHero &&
            headerTotals.completePct === 100 &&
            !hasActivity;

          if (isFullyTranslated) {
            return (
              <header className="w-full border-b">
                <div className="mx-auto flex h-[120px] max-w-[1248px] items-center px-6">
                  <h1 className="text-[32px] font-semibold tracking-tight">
                    Translations
                  </h1>
                </div>
              </header>
            );
          }

          if (showHero) {
            return (
              <header className="w-full border-b">
                <div className="mx-auto flex h-[120px] max-w-[1248px] items-center justify-between gap-6 px-6">
                  {/* Left: title + subtitle. Matches the title block on
                      /items (items-panel.tsx:156-158) and /items/categories
                      — a `space-y-1` container with the dashboard H1. The
                      subtitle survives because the % alone doesn't show
                      scope (rows + languages); items/categories don't
                      carry that signal in their title.

                      The % and translated count animate via
                      useAnimatedNumber so realtime updates from the worker
                      read as "the number is ticking up" rather than
                      snapping. `tabular-nums` keeps glyph widths fixed so
                      the title doesn't shimmy during the tween. */}
                  <div className="min-w-0 space-y-1">
                    <h1 className="text-[32px] font-semibold leading-tight tracking-tight">
                      Your catalog is{" "}
                      <span className="tabular-nums">
                        {Math.round(animatedPct)}
                      </span>
                      % translated
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      <span className="tabular-nums">
                        {Math.round(animatedTranslated)}
                      </span>{" "}
                      of{" "}
                      <span className="tabular-nums">
                        {headerTotals.total}
                      </span>{" "}
                      translation rows are done across {targetLocales.length}{" "}
                      {targetLocales.length === 1 ? "language" : "languages"}.
                    </p>
                    {/* Live activity pulse — visible only while at least one
                        translation_job is queued/processing for this catalog.
                        Soft amber dot + plain English copy ("AI translating
                        into Русский…"). Disappears when the worker finishes. */}
                    {activeJobs.length > 0 && (
                      <p
                        className="flex items-center gap-2 pt-1 text-xs text-muted-foreground"
                        aria-live="polite"
                      >
                        <span
                          className="relative inline-flex size-2 shrink-0"
                          aria-hidden="true"
                        >
                          <span className="absolute inset-0 inline-flex animate-ping rounded-full bg-amber-500/60" />
                          <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
                        </span>
                        {formatActivityCopy(activeJobs, targetLocales)}
                      </p>
                    )}
                  </div>

                  {/* Right: master CTA. Same slot as "Add item" / "Create
                      category" on the sibling pages. */}
                  {headerTotals.notTranslated > 0 && (
                    <div className="shrink-0">
                      <TranslateEverythingButton
                        catalogId={catalogId}
                        targetLocales={targetLocales}
                        items={items}
                        onEnqueued={refreshAfterMutation}
                        isAiBusy={hasActivity}
                      />
                    </div>
                  )}
                </div>
              </header>
            );
          }

          // Empty-state header — no target locales OR no items.
          return (
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
          );
        })()}

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
                      "inline-flex h-auto gap-1 border border-border p-1 py-0",
                      "bg-background/85 shadow-sm backdrop-blur-md",
                    )}
                  >
                    <TabsTrigger
                      value="overview"
                      className={cn(
                        " px-3",
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
                    <TabsTrigger
                      value="categories"
                      className={cn(
                        "rounded-full px-3",
                        "data-[state=active]:bg-foreground data-[state=active]:text-background",
                      )}
                    >
                      Categories
                    </TabsTrigger>
                    <TabsTrigger
                      value="variations"
                      className={cn(
                        "rounded-full px-3",
                        "data-[state=active]:bg-foreground data-[state=active]:text-background",
                      )}
                    >
                      Variations
                    </TabsTrigger>
                    <TabsTrigger
                      value="modifier_lists"
                      className={cn(
                        "rounded-full px-3",
                        "data-[state=active]:bg-foreground data-[state=active]:text-background",
                      )}
                    >
                      Modifier lists
                    </TabsTrigger>
                    <TabsTrigger
                      value="modifiers"
                      className={cn(
                        "rounded-full px-3",
                        "data-[state=active]:bg-foreground data-[state=active]:text-background",
                      )}
                    >
                      Modifiers
                    </TabsTrigger>
                    {/* "Catalog" (shop name + description) tab stays
                        deferred — Phase 2 spec says ship only if demand
                        evidence emerges. The DisabledTab placeholder
                        documents the gap without taking up active surface. */}
                    <DisabledTab
                      label="Catalog"
                      reason="Catalog meta (shop name + description) ships once a merchant asks for it. The workbench will turn it on then."
                    />
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
                  busyLocales={busyLocales}
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
                    recentlyUpdated={recentlyUpdated}
                  />
                )}
              </TabsContent>

              <TabsContent
                value="categories"
                className="flex-1 overflow-auto p-4 md:p-6"
              >
                {enabledLocales.length <= 1 ? (
                  <NoTargetLocalesEmpty hasDefaultLocale={defaultLocale !== null} />
                ) : (
                  <EntityTranslationsTab
                    catalogId={catalogId}
                    entityKind="category"
                    entityLabel="category"
                    entityLabelPlural="categories"
                    fields={["name", "description"] as const}
                    rows={categories}
                    defaultLocale={defaultLocale}
                    targetLocales={targetLocales}
                    busyLocales={busyLocales}
                    onMutation={refreshAfterMutation}
                  />
                )}
              </TabsContent>

              <TabsContent
                value="variations"
                className="flex-1 overflow-auto p-4 md:p-6"
              >
                {enabledLocales.length <= 1 ? (
                  <NoTargetLocalesEmpty hasDefaultLocale={defaultLocale !== null} />
                ) : (
                  <EntityTranslationsTab
                    catalogId={catalogId}
                    entityKind="variation"
                    entityLabel="variation"
                    entityLabelPlural="variations"
                    fields={["name"] as const}
                    rows={variations}
                    defaultLocale={defaultLocale}
                    targetLocales={targetLocales}
                    busyLocales={busyLocales}
                    onMutation={refreshAfterMutation}
                  />
                )}
              </TabsContent>

              <TabsContent
                value="modifier_lists"
                className="flex-1 overflow-auto p-4 md:p-6"
              >
                {enabledLocales.length <= 1 ? (
                  <NoTargetLocalesEmpty hasDefaultLocale={defaultLocale !== null} />
                ) : (
                  <EntityTranslationsTab
                    catalogId={catalogId}
                    entityKind="modifier_list"
                    entityLabel="modifier list"
                    entityLabelPlural="modifier lists"
                    fields={["name"] as const}
                    rows={modifierLists}
                    defaultLocale={defaultLocale}
                    targetLocales={targetLocales}
                    busyLocales={busyLocales}
                    onMutation={refreshAfterMutation}
                  />
                )}
              </TabsContent>

              <TabsContent
                value="modifiers"
                className="flex-1 overflow-auto p-4 md:p-6"
              >
                {enabledLocales.length <= 1 ? (
                  <NoTargetLocalesEmpty hasDefaultLocale={defaultLocale !== null} />
                ) : (
                  <EntityTranslationsTab
                    catalogId={catalogId}
                    entityKind="modifier"
                    entityLabel="modifier"
                    entityLabelPlural="modifiers"
                    fields={["name"] as const}
                    rows={modifiers}
                    defaultLocale={defaultLocale}
                    targetLocales={targetLocales}
                    busyLocales={busyLocales}
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

// ============================================================================
// formatActivityCopy — builds the "AI translating into X…" pulse string
//
// translation_jobs is one-row-per-entity, so a bulk translate of 23
// items into Russian shows up as 23 separate rows in `jobs`. Group
// by target_locale to derive the per-language count for the copy.
//
// One locale:    "AI translating 23 items into Русский…"
// Two locales:   "AI translating into Русский (23) and English (17)…"
// Many locales:  "AI translating into 3 languages (62 items)…"
// ============================================================================

function formatActivityCopy(
  jobs: ActiveJob[],
  targetLocales: CatalogLocale[],
): string {
  const localeName = (code: string): string =>
    targetLocales.find((l) => l.locale === code)?.display_name ?? code;

  if (jobs.length === 0) return "";

  // Bucket: locale code → in-flight job count.
  const byLocale = new Map<string, number>();
  for (const j of jobs) {
    byLocale.set(j.targetLocale, (byLocale.get(j.targetLocale) ?? 0) + 1);
  }
  const entries = Array.from(byLocale.entries());

  if (entries.length === 1) {
    const [code, count] = entries[0];
    const name = localeName(code);
    return `AI translating ${count} item${count === 1 ? "" : "s"} into ${name}…`;
  }

  if (entries.length === 2) {
    const [a, b] = entries;
    return `AI translating into ${localeName(a[0])} (${a[1]}) and ${localeName(b[0])} (${b[1]})…`;
  }

  return `AI translating into ${entries.length} languages (${jobs.length} items)…`;
}

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
