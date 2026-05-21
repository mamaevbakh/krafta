"use client";

import * as React from "react";
import { Sparkles, ArrowRight, Check, Package } from "lucide-react";

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
  /**
   * Locale codes with an in-flight translation_job. Each row disables
   * its own AI bulk button when its locale is in this set, so the
   * merchant can't stack a second batch on top of the running one.
   */
  busyLocales?: ReadonlySet<string>;
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
  busyLocales,
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
    <div className="flex flex-col gap-5">
      {/* Hero band (% complete + master "translate everything" CTA) lives
          in the persistent panel header now, not here. */}

      {/* ===================================================================
          COVERAGE BY LANGUAGE — compact rows (one line per language)
      =================================================================== */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          By language
        </h3>
        <ul className="flex flex-col gap-1.5">
          {targetLocales.map((locale) => {
            const row = completeness.byLocale.get(locale.locale) ?? {
              translated: 0,
              needsReview: 0,
              notTranslated: items.length,
              total: items.length,
            };
            return (
              <LanguageCoverageRow
                key={locale.locale}
                catalogId={catalogId}
                locale={locale}
                stats={row}
                items={items}
                isLocaleBusy={busyLocales?.has(locale.locale) ?? false}
                onJumpToItems={onJumpToItems}
                onMutation={onMutation}
              />
            );
          })}
        </ul>
      </section>

      {/* Inline cost + scope footer was removed — the merchant has
          already seen Phase 1 scope on first visit and the cost data
          lives on the quotas table for future analytics surfaces. */}
    </div>
  );
}

// ============================================================================
// LanguageCoverageRow — compact, single-line per-locale row
//
// Replaces the older LanguageCoverageCard (big card with stacked content).
// One row ≈ 36px tall on desktop; wraps gracefully on narrow viewports.
// Same affordances (two buttons), just compressed.
// ============================================================================

function LanguageCoverageRow({
  catalogId,
  locale,
  stats,
  items,
  isLocaleBusy,
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
  /** True when this locale has an in-flight translation_job. The
   *  row's AI bulk button disables + relabels so the merchant can't
   *  enqueue a second batch on top. */
  isLocaleBusy: boolean;
  onJumpToItems: (filter: ItemsFilter) => void;
  onMutation: () => void;
}) {
  const hasWork = stats.notTranslated + stats.needsReview > 0;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-card px-3 py-2">
      {/* Name + code — fixed-ish width so multiple rows align vertically */}
      <div className="flex w-32 min-w-0 shrink-0 items-baseline gap-1.5">
        <span
          className="truncate text-sm font-medium"
          lang={locale.locale}
        >
          {locale.display_name}
        </span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
          {locale.locale}
        </span>
      </div>

      {/* Progress bar — flex-1 so it absorbs available width */}
      <div className="min-w-[120px] flex-1">
        <StackedProgressBar
          translated={stats.translated}
          needsReview={stats.needsReview}
          notTranslated={stats.notTranslated}
          total={stats.total}
        />
      </div>

      {/* Compact counts — dot + number, no labels (the bar shows what's
          what; labels would crowd the row). Tooltip if needed in V2. */}
      <div className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
        <span
          className="inline-flex items-center gap-1"
          title={`${stats.translated} translated`}
        >
          <span
            className="size-1.5 rounded-full bg-emerald-500"
            aria-hidden="true"
          />
          <span className="text-foreground">{stats.translated}</span>
        </span>
        <span
          className="inline-flex items-center gap-1"
          title={`${stats.needsReview} need review`}
        >
          <span
            className="size-1.5 rounded-full bg-amber-500"
            aria-hidden="true"
          />
          <span
            className={cn(
              stats.needsReview === 0
                ? "text-muted-foreground/50"
                : "text-foreground",
            )}
          >
            {stats.needsReview}
          </span>
        </span>
        <span
          className="inline-flex items-center gap-1"
          title={`${stats.notTranslated} not translated`}
        >
          <span
            className="size-1.5 rounded-full bg-muted-foreground/40"
            aria-hidden="true"
          />
          <span
            className={cn(
              stats.notTranslated === 0
                ? "text-muted-foreground/50"
                : "text-foreground",
            )}
          >
            {stats.notTranslated}
          </span>
        </span>
      </div>

      {/* Actions — both buttons visible per accessibility-first guideline.
          Hidden entirely when the language is fully done (clean "all good"
          read with no dangling controls). */}
      {hasWork ? (
        <div className="flex shrink-0 items-center gap-1.5">
          {stats.notTranslated > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() =>
                onJumpToItems({
                  status: "not-translated",
                  language: locale.locale,
                })
              }
            >
              <ArrowRight className="size-3" aria-hidden="true" />
              Find {stats.notTranslated}
            </Button>
          )}
          {stats.needsReview > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() =>
                onJumpToItems({
                  status: "needs-review",
                  language: locale.locale,
                })
              }
            >
              <ArrowRight className="size-3" aria-hidden="true" />
              Review {stats.needsReview}
            </Button>
          )}
          <TranslateAllButton
            catalogId={catalogId}
            targetLocale={locale}
            items={items}
            onEnqueued={onMutation}
            labelMode="compact"
            isAiBusy={isLocaleBusy}
          />
        </div>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-emerald-600 dark:text-emerald-500">
          <Check className="size-3.5" aria-hidden="true" />
          All done
        </span>
      )}
    </li>
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

// LanguageCoverageCard / StatPill / ScopeSection / ScopeChip were
// removed — replaced by LanguageCoverageRow + the inline footer above.
// The compact-row layout halves vertical real estate while preserving
// every signal the cards carried.

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
