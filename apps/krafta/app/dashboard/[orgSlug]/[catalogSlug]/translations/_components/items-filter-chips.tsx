"use client";

import * as React from "react";
import { Check, AlertCircle, XCircle, List, X } from "lucide-react";

import { cn } from "@/lib/utils";

import type { CatalogLocale } from "./languages-sidebar";
import type { ItemRow } from "./items-tab";

/**
 * Filter chips for the Items tab.
 *
 * Two axes:
 *   - Status: all / not-translated / needs-review / translated
 *   - Language: all / one of the target locale codes
 *
 * They're presented as two rows of pill chips (rounded-full) so the merchant
 * can combine "needs review" + "Russian" with two taps. Counts are baked
 * into the chip label so each chip doubles as a worklist indicator:
 *
 *     [ Not translated · 23 ]
 *
 * The chip IS the call to action. No separate "23 items waiting" stat.
 *
 * Why this lives in its own file: OverviewTab needs the ItemsFilter type
 * to build "Find these" payloads, but doesn't render the chips. Keeping
 * the type and the chip UI together makes the contract obvious.
 */

export type ItemsStatusFilter =
  | "all"
  | "not-translated"
  | "needs-review"
  | "translated";

export type ItemsLanguageFilter = "all" | string;

export type ItemsFilter = {
  status: ItemsStatusFilter;
  language: ItemsLanguageFilter;
};

export const DEFAULT_ITEMS_FILTER: ItemsFilter = {
  status: "all",
  language: "all",
};

// ============================================================================
// Pure helpers — applied by ItemsTab to derive the visible rows
// ============================================================================

/**
 * For a given (item, locale), classify the translation row into one of three
 * buckets so chip filters can match against it.
 *
 * Semantics (corrected — AI translations count as translated):
 *   - "not-translated": no translation row exists for this locale
 *   - "needs-review":   row exists but the source text changed since it was
 *                       written (the stale flag). The translation is still
 *                       SHOWN on the storefront — anon RLS doesn't filter
 *                       it — but the merchant should re-check it.
 *   - "translated":     row exists AND fresh. Both AI-generated rows and
 *                       human-edited rows live here. AI translations are
 *                       customer-facing the moment the worker writes them;
 *                       the manual "Accept" flow is merchant moderation,
 *                       not a publish gate.
 *
 * Why this changed: the previous model treated is_ai_translated=true as a
 * "not yet done" state, which contradicted the storefront's behavior (anon
 * SELECT doesn't filter on is_ai_translated). The header would read "5%
 * translated" when customers were actually seeing 100% of the catalog in
 * their language. The AI-vs-human distinction is still surfaced per-row
 * via the table's "AI — review" badge, but it's informational/moderation
 * signal, not a completeness signal.
 */
export function classifyTranslation(
  item: ItemRow,
  locale: string,
): "not-translated" | "needs-review" | "translated" {
  const t = item.item_translations.find((tr) => tr.locale === locale);
  if (!t) return "not-translated";
  const stale =
    item.current_source_hash !== null &&
    t.source_hash !== null &&
    item.current_source_hash !== t.source_hash;
  if (stale) return "needs-review";
  return "translated";
}

/**
 * Returns true if `item` matches the active filter — used by ItemsTab to
 * filter the rendered list.
 *
 * Status semantics with language=all:
 *   - "not-translated": item has AT LEAST ONE target locale not translated
 *   - "needs-review":   item has AT LEAST ONE target locale needing review
 *   - "translated":     item has ALL target locales translated (no gaps)
 *
 * With language=X, the bucket is just for that single locale.
 */
export function matchesFilter(
  item: ItemRow,
  filter: ItemsFilter,
  targetLocales: CatalogLocale[],
): boolean {
  if (filter.status === "all" && filter.language === "all") return true;

  const localesToCheck =
    filter.language === "all"
      ? targetLocales.map((l) => l.locale)
      : [filter.language];

  if (filter.status === "all") {
    // language=X, status=all → always include (the filter is just narrowing
    // the columns of interest; rows aren't filtered out).
    return true;
  }

  if (filter.language !== "all") {
    // Specific language: check that one locale only.
    return classifyTranslation(item, filter.language) === filter.status;
  }

  // language=all + status=X: item matches if ANY locale is in that bucket,
  // EXCEPT for "translated" which requires ALL locales to be done.
  if (filter.status === "translated") {
    return localesToCheck.every(
      (loc) => classifyTranslation(item, loc) === "translated",
    );
  }
  return localesToCheck.some(
    (loc) => classifyTranslation(item, loc) === filter.status,
  );
}

// ============================================================================
// Counts — what gets stamped on the chips
// ============================================================================

export type ChipCounts = {
  status: Record<ItemsStatusFilter, number>;
  /** Indexed by locale code; counts the items NOT translated in that locale
   *  (the most actionable signal for "which language has the biggest gap"). */
  languageMissing: Record<string, number>;
};

export function computeChipCounts(
  items: ItemRow[],
  targetLocales: CatalogLocale[],
  filter: ItemsFilter,
): ChipCounts {
  // Status counts respect the current language filter — the chip shows
  // "how many rows would this status reveal, scoped to the chosen language".
  const counts: ChipCounts = {
    status: {
      all: 0,
      "not-translated": 0,
      "needs-review": 0,
      translated: 0,
    },
    languageMissing: {},
  };
  for (const item of items) {
    if (matchesFilter(item, { ...filter, status: "all" }, targetLocales)) {
      counts.status.all += 1;
    }
    if (
      matchesFilter(
        item,
        { ...filter, status: "not-translated" },
        targetLocales,
      )
    ) {
      counts.status["not-translated"] += 1;
    }
    if (
      matchesFilter(
        item,
        { ...filter, status: "needs-review" },
        targetLocales,
      )
    ) {
      counts.status["needs-review"] += 1;
    }
    if (
      matchesFilter(item, { ...filter, status: "translated" }, targetLocales)
    ) {
      counts.status.translated += 1;
    }

    // Language counts are independent of the status filter — they always
    // show "how many items lack a translation in this language" so the
    // merchant has a stable workload signal.
    for (const locale of targetLocales) {
      const bucket = classifyTranslation(item, locale.locale);
      if (bucket === "not-translated") {
        counts.languageMissing[locale.locale] =
          (counts.languageMissing[locale.locale] ?? 0) + 1;
      }
    }
  }
  return counts;
}

// ============================================================================
// Chip UI
// ============================================================================

const STATUS_OPTIONS: Array<{
  key: ItemsStatusFilter;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    key: "all",
    label: "All",
    icon: <List className="size-3.5" aria-hidden="true" />,
  },
  {
    key: "not-translated",
    label: "Not translated",
    icon: (
      <XCircle
        className="size-3.5 text-muted-foreground"
        aria-hidden="true"
      />
    ),
  },
  {
    key: "needs-review",
    label: "Needs review",
    icon: (
      <AlertCircle
        className="size-3.5 text-amber-600 dark:text-amber-500"
        aria-hidden="true"
      />
    ),
  },
  {
    key: "translated",
    label: "Translated",
    icon: (
      <Check
        className="size-3.5 text-emerald-600 dark:text-emerald-500"
        aria-hidden="true"
      />
    ),
  },
];

export function ItemsFilterChips({
  filter,
  onFilterChange,
  targetLocales,
  counts,
}: {
  filter: ItemsFilter;
  onFilterChange: (next: ItemsFilter) => void;
  targetLocales: CatalogLocale[];
  counts: ChipCounts;
}) {
  const hasActiveFilter =
    filter.status !== "all" || filter.language !== "all";

  return (
    <div className="flex flex-col gap-2">
      {/* Status row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Show
        </span>
        {STATUS_OPTIONS.map((opt) => (
          <Chip
            key={opt.key}
            active={filter.status === opt.key}
            onClick={() => onFilterChange({ ...filter, status: opt.key })}
            icon={opt.icon}
            label={opt.label}
            count={counts.status[opt.key]}
          />
        ))}
        {hasActiveFilter && (
          <button
            type="button"
            onClick={() =>
              onFilterChange({ status: "all", language: "all" })
            }
            className={cn(
              "ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs",
              "text-muted-foreground hover:text-foreground",
            )}
          >
            <X className="size-3" aria-hidden="true" />
            Clear filter
          </button>
        )}
      </div>

      {/* Language row — only meaningful when there's more than one target */}
      {targetLocales.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Language
          </span>
          <Chip
            active={filter.language === "all"}
            onClick={() => onFilterChange({ ...filter, language: "all" })}
            label="All"
          />
          {targetLocales.map((locale) => (
            <Chip
              key={locale.locale}
              active={filter.language === locale.locale}
              onClick={() =>
                onFilterChange({ ...filter, language: locale.locale })
              }
              label={locale.display_name}
              langAttr={locale.locale}
              // Always show "X not translated" — the most actionable signal.
              countSuffix={
                (counts.languageMissing[locale.locale] ?? 0) > 0
                  ? `${counts.languageMissing[locale.locale]} ✕`
                  : null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  icon,
  label,
  count,
  countSuffix,
  langAttr,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  count?: number;
  countSuffix?: string | null;
  langAttr?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Generous touch target (h-8 = 32px). Plain English label always
      // visible. font-medium (500) per DESIGN.md §Typography for labels —
      // chips ARE labels, so the medium weight is the right default. The
      // count next to the label stays at the same weight for legibility;
      // active-state inversion provides the emphasis, not weight bumps.
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
        "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        active
          ? "border-transparent bg-foreground text-background shadow-sm"
          : "border-border bg-background text-foreground hover:bg-muted/60",
      )}
      aria-pressed={active}
    >
      {icon}
      <span lang={langAttr}>{label}</span>
      {typeof count === "number" && (
        <span
          className={cn(
            "tabular-nums",
            active ? "opacity-80" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
      {countSuffix && (
        <span
          className={cn(
            "tabular-nums",
            active ? "opacity-80" : "text-muted-foreground",
          )}
        >
          {countSuffix}
        </span>
      )}
    </button>
  );
}
