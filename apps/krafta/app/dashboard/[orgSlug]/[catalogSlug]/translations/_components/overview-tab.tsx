"use client";

import * as React from "react";
import {
  Sparkles,
  ArrowRight,
  Check,
  AlertCircle,
  XCircle,
  Package,
  FolderTree,
  Boxes,
  ListPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { TranslateAllButton } from "./translate-all-button";
import type { CatalogLocale } from "./languages-sidebar";
import type { ItemRow } from "./items-tab";
import type {
  ItemsFilter,
  ItemsStatusFilter,
} from "./items-filter-chips";

/**
 * Overview tab — landing tab for the Translations workbench.
 *
 * Two goals (the third — hero "% translated" band + master CTA — moved
 * into the persistent panel header so the progress stays visible across
 * tabs):
 *   1. Point the merchant at the work — per-language coverage cards with
 *      two CTAs each: "find these" to filter the Items tab, "translate
 *      with AI" for bulk.
 *   2. Be honest about Phase 1 scope (items only; categories/variations
 *      coming in Phase 2).
 *
 * Plain-English labels throughout — "Not translated" / "Needs review" /
 * "Translated" — because the merchant audience skews non-technical and
 * spans every age bracket.
 *
 * S1a: static numbers, no realtime yet. S2 layers in animated counters
 * + Supabase Realtime so this whole surface comes alive as the worker
 * processes jobs.
 */

export type OverviewCompleteness = {
  /** Per-locale stats indexed by locale code. */
  byLocale: Map<
    string,
    {
      translated: number; // human-reviewed + not stale
      needsReview: number; // AI-not-yet-reviewed OR stale
      notTranslated: number; // missing entirely
      total: number;
    }
  >;
};

export type OverviewTabProps = {
  catalogId: string;
  defaultLocale: CatalogLocale | null;
  targetLocales: CatalogLocale[];
  items: ItemRow[];
  /**
   * Pre-computed per-locale completeness. Built in TranslationsPanel from
   * the items + completeness view rows so OverviewTab and ItemsTab share
   * one source of truth.
   */
  completeness: OverviewCompleteness;
  /** Cost / activity numbers for the running total block. Lifetime
   *  cumulative — `total_usd_estimated` from the quotas table and a count
   *  of `item_translations.is_ai_translated = true` rows. Optional; null
   *  renders an empty-friendly placeholder. */
  costSinceStart: {
    usd: number;
    aiCount: number;
  } | null;
  /** Counts of other entity kinds for the Phase 1 scope honesty section. */
  scopeCounts: {
    items: number;
    categories: number;
    variations: number;
    modifierLists: number;
  };
  /** Called when a coverage card's "Find these" button is clicked. The
   *  panel uses this to switch to the Items tab with chips pre-selected. */
  onJumpToItems: (filter: ItemsFilter) => void;
  onMutation: () => void;
};

export function OverviewTab({
  catalogId,
  defaultLocale: _defaultLocale,
  targetLocales,
  items,
  completeness,
  costSinceStart,
  scopeCounts,
  onJumpToItems,
  onMutation,
}: OverviewTabProps) {
  // Aggregate totals + hero band live in the panel header now (so they
  // stay visible across tabs). Overview only computes per-language card
  // breakdowns from the completeness map passed in.

  // Empty-states first.
  if (targetLocales.length === 0) {
    return <NoTargetLocalesEmptyState />;
  }
  if (items.length === 0) {
    return <NoItemsEmptyState />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Hero band (% complete + master "translate everything" CTA) lives
          in the persistent panel header now, not here. That way the
          progress remains visible while the merchant works in Items/etc.
          and the master CTA is always one click away. */}

      {/* ===================================================================
          COVERAGE BY LANGUAGE — the work-finder
      =================================================================== */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          By language
        </h3>
        <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
          {targetLocales.map((locale) => {
            const row = completeness.byLocale.get(locale.locale) ?? {
              translated: 0,
              needsReview: 0,
              notTranslated: items.length,
              total: items.length,
            };
            return (
              <LanguageCoverageCard
                key={locale.locale}
                catalogId={catalogId}
                locale={locale}
                stats={row}
                items={items}
                onJumpToItems={onJumpToItems}
                onMutation={onMutation}
              />
            );
          })}
        </div>
      </section>

      {/* ===================================================================
          PHASE 1 SCOPE HONESTY
      =================================================================== */}
      <ScopeSection counts={scopeCounts} />

      {/* ===================================================================
          TOTAL TO DATE — lifetime cost + activity
          Inlined (not a separate component) because it's tiny, used
          exactly once, and inlining sidesteps a stubborn Turbopack HMR
          cache that kept resolving the old component name after a rename.
      =================================================================== */}
      {!costSinceStart || costSinceStart.aiCount === 0 ? (
        <section className="flex flex-col gap-1 rounded-lg border bg-card p-4">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Total to date
          </h3>
          <p className="text-xs text-muted-foreground">
            No AI translations yet. Run a bulk translate above and the cost
            will show up here.
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-2 rounded-lg border bg-card p-4">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Total to date
          </h3>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                ${costSinceStart.usd.toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground">
                spent on AI
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {costSinceStart.aiCount.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">
                AI translation{costSinceStart.aiCount === 1 ? "" : "s"}{" "}
                completed
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ============================================================================
// StackedProgressBar — three-segment horizontal bar
//
// Exported because the panel header reuses it for the persistent hero band.
// ============================================================================

export function StackedProgressBar({
  translated,
  needsReview,
  notTranslated,
  total,
}: {
  translated: number;
  needsReview: number;
  notTranslated: number;
  total: number;
}) {
  if (total === 0) {
    return (
      <div className="h-3 w-full rounded-full bg-muted" aria-hidden="true" />
    );
  }
  const tPct = (translated / total) * 100;
  const rPct = (needsReview / total) * 100;
  const nPct = (notTranslated / total) * 100;

  return (
    <div
      className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={`${translated} translated, ${needsReview} needs review, ${notTranslated} not translated`}
    >
      <div
        className="h-full bg-emerald-500 transition-[width] duration-500 ease-out"
        style={{ width: `${tPct}%` }}
      />
      <div
        className="h-full bg-amber-500 transition-[width] duration-500 ease-out"
        style={{ width: `${rPct}%` }}
      />
      <div
        className="h-full bg-transparent"
        style={{ width: `${nPct}%` }}
      />
    </div>
  );
}

// ============================================================================
// LanguageCoverageCard — one per target locale
// ============================================================================

function LanguageCoverageCard({
  catalogId,
  locale,
  stats,
  items,
  onJumpToItems,
  onMutation,
}: {
  catalogId: string;
  locale: CatalogLocale;
  stats: {
    translated: number;
    needsReview: number;
    notTranslated: number;
    total: number;
  };
  items: ItemRow[];
  onJumpToItems: (filter: ItemsFilter) => void;
  onMutation: () => void;
}) {
  const hasWork = stats.notTranslated + stats.needsReview > 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      {/* Header: language name + native name */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h4
            className="truncate text-base font-semibold"
            lang={locale.locale}
          >
            {locale.display_name}
          </h4>
          <span className="shrink-0 text-xs text-muted-foreground">
            {locale.locale}
          </span>
        </div>
        {!hasWork && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-500">
            <Check className="size-3.5" aria-hidden="true" />
            All done
          </span>
        )}
      </div>

      {/* Stacked bar */}
      <StackedProgressBar
        translated={stats.translated}
        needsReview={stats.needsReview}
        notTranslated={stats.notTranslated}
        total={stats.total}
      />

      {/* Stat row with icons + plain English */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <StatPill
          icon={<Check className="size-3.5 text-emerald-600 dark:text-emerald-500" />}
          label="Translated"
          count={stats.translated}
        />
        <StatPill
          icon={<AlertCircle className="size-3.5 text-amber-600 dark:text-amber-500" />}
          label="Needs review"
          count={stats.needsReview}
        />
        <StatPill
          icon={<XCircle className="size-3.5 text-muted-foreground" />}
          label="Not translated"
          count={stats.notTranslated}
        />
      </div>

      {/* CTAs — only show when there's work; otherwise the card reads as
          "done" with the green tick above. */}
      {hasWork && (
        <div className="flex flex-wrap gap-2 pt-1">
          {stats.notTranslated > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() =>
                onJumpToItems({
                  status: "not-translated",
                  language: locale.locale,
                })
              }
            >
              Find these {stats.notTranslated}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          {stats.needsReview > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() =>
                onJumpToItems({
                  status: "needs-review",
                  language: locale.locale,
                })
              }
            >
              Review {stats.needsReview}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          <TranslateAllButton
            catalogId={catalogId}
            targetLocale={locale}
            items={items}
            onEnqueued={onMutation}
            labelMode="compact"
          />
        </div>
      )}
    </div>
  );
}

function StatPill({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        count === 0 && "text-muted-foreground/50",
      )}
    >
      {icon}
      <span>
        <span className="font-medium">{count}</span>{" "}
        <span className="text-muted-foreground">{label}</span>
      </span>
    </span>
  );
}

// ============================================================================
// ScopeSection — Phase 1 honesty
// ============================================================================

function ScopeSection({
  counts,
}: {
  counts: OverviewTabProps["scopeCounts"];
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4">
      <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        What we translate today
      </h3>
      <p className="text-xs text-muted-foreground">
        Translations are live for items. Other entities ship in Phase 2 with
        the same drift detection and AI workflow.
      </p>
      <ul className="flex flex-wrap gap-2 pt-1 text-xs">
        <ScopeChip
          icon={<Package className="size-3.5" aria-hidden="true" />}
          label="Items"
          count={counts.items}
          active
        />
        <ScopeChip
          icon={<FolderTree className="size-3.5" aria-hidden="true" />}
          label="Categories"
          count={counts.categories}
        />
        <ScopeChip
          icon={<Boxes className="size-3.5" aria-hidden="true" />}
          label="Variations"
          count={counts.variations}
        />
        <ScopeChip
          icon={<ListPlus className="size-3.5" aria-hidden="true" />}
          label="Modifier lists"
          count={counts.modifierLists}
        />
      </ul>
    </section>
  );
}

function ScopeChip({
  icon,
  label,
  count,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active?: boolean;
}) {
  return (
    <li
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
        active
          ? "border-emerald-500/30 bg-emerald-500/10 text-foreground"
          : "border-border bg-background text-muted-foreground",
      )}
    >
      {icon}
      <span>
        <span className="font-medium">{label}</span>
        <span className="ml-1 opacity-70">({count})</span>
      </span>
      {active ? (
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-500" aria-hidden="true" />
      ) : (
        <span className="text-[10px] uppercase tracking-wide opacity-60">
          Phase 2
        </span>
      )}
    </li>
  );
}

// TranslateEverythingButton lives in its own file now
// (./translate-everything-button.tsx) so the panel header can render it
// alongside the hero progress bar.

// ============================================================================
// Empty states
// ============================================================================

function NoTargetLocalesEmptyState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <Sparkles className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-sm font-medium">No target languages yet</h2>
      <p className="text-xs text-muted-foreground">
        Add a target language in the sidebar on the left. We&apos;ll start
        translating your items into it automatically.
      </p>
    </div>
  );
}

function NoItemsEmptyState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <Package className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-sm font-medium">No items in this catalog yet</h2>
      <p className="text-xs text-muted-foreground">
        Add items in the catalog library first. Once items exist, this overview
        will show your translation coverage by language.
      </p>
    </div>
  );
}

/** Re-export the status filter type so callers can build filter payloads
 *  without depending on the chip file directly. */
export type { ItemsStatusFilter };
