"use client";

import * as React from "react";
import { Check, XCircle, List, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/locales/dashboard/context";

import type { CatalogLocale } from "./languages-sidebar";
import type { EntityRowForTable } from "./entity-translations-tab";

/**
 * Filter chips for the Phase 2 entity tabs (Categories / Variations /
 * Modifier lists / Modifiers).
 *
 * Mirrors the Items tab's `items-filter-chips.tsx` UX byte-for-byte —
 * Show row (All · Not translated · Translated) + Language row (per
 * target locale, with "N ✕" count for missing). The pattern is
 * deliberate: one mental model for the merchant across every tab.
 *
 * Why a separate file instead of generalizing items-filter-chips:
 * ItemRow and EntityRowForTable diverge in shape (translation array
 * name `item_translations` vs `translations`, extra fields on ItemRow),
 * so a parameterized version would need awkward generics. Duplicating
 * the chip + classify pair is the cheaper trade — the UX is locked, so
 * any future divergence on either tab won't accidentally leak into
 * the other.
 */

export type EntityStatusFilter = "all" | "not-translated" | "translated";
export type EntityLanguageFilter = "all" | string;

export type EntityFilter = {
  status: EntityStatusFilter;
  language: EntityLanguageFilter;
};

export const DEFAULT_ENTITY_FILTER: EntityFilter = {
  status: "all",
  language: "all",
};

// ============================================================================
// Pure helpers — translated/not-translated classification per row × locale
// ============================================================================

/**
 * For (row, locale): does a translation row exist? That's the entire
 * surfaced status. Drift (source_hash mismatch) is metadata and is
 * displayed via the per-cell amber dot, not as a filter bucket — same
 * decision the Items tab made (see classifyTranslation in
 * items-filter-chips.ts for the rationale).
 */
export function classifyEntityTranslation(
  row: EntityRowForTable,
  locale: string,
): "not-translated" | "translated" {
  const t = row.translations.find((tr) => tr.locale === locale);
  return t ? "translated" : "not-translated";
}

/**
 * Returns true when `row` matches the active filter. Mirrors the Items
 * matcher: status=all is a pass; language=all + status=X uses
 * "any locale matches" for not-translated and "all locales match" for
 * translated.
 */
export function matchesEntityFilter(
  row: EntityRowForTable,
  filter: EntityFilter,
  targetLocales: CatalogLocale[],
): boolean {
  if (filter.status === "all" && filter.language === "all") return true;

  const localesToCheck =
    filter.language === "all"
      ? targetLocales.map((l) => l.locale)
      : [filter.language];

  if (filter.status === "all") return true;

  if (filter.language !== "all") {
    return classifyEntityTranslation(row, filter.language) === filter.status;
  }

  if (filter.status === "translated") {
    return localesToCheck.every(
      (loc) => classifyEntityTranslation(row, loc) === "translated",
    );
  }
  return localesToCheck.some(
    (loc) => classifyEntityTranslation(row, loc) === filter.status,
  );
}

// ============================================================================
// Counts
// ============================================================================

export type EntityChipCounts = {
  status: Record<EntityStatusFilter, number>;
  languageMissing: Record<string, number>;
};

export function computeEntityChipCounts(
  rows: EntityRowForTable[],
  targetLocales: CatalogLocale[],
  filter: EntityFilter,
): EntityChipCounts {
  const counts: EntityChipCounts = {
    status: { all: 0, "not-translated": 0, translated: 0 },
    languageMissing: {},
  };
  for (const row of rows) {
    if (matchesEntityFilter(row, { ...filter, status: "all" }, targetLocales)) {
      counts.status.all += 1;
    }
    if (
      matchesEntityFilter(
        row,
        { ...filter, status: "not-translated" },
        targetLocales,
      )
    ) {
      counts.status["not-translated"] += 1;
    }
    if (
      matchesEntityFilter(
        row,
        { ...filter, status: "translated" },
        targetLocales,
      )
    ) {
      counts.status.translated += 1;
    }
    // Language counts ignore the status filter so the workload signal
    // stays stable as the merchant scopes by status.
    for (const locale of targetLocales) {
      const bucket = classifyEntityTranslation(row, locale.locale);
      if (bucket === "not-translated") {
        counts.languageMissing[locale.locale] =
          (counts.languageMissing[locale.locale] ?? 0) + 1;
      }
    }
  }
  return counts;
}

// ============================================================================
// Chip UI — identical to items-filter-chips.tsx so the two tabs feel like
// the same workbench. Duplicated rather than imported because each file
// already owns its own row-shape helpers; sharing the UI would re-introduce
// the awkward generics this file exists to avoid.
// ============================================================================

const STATUS_OPTIONS: Array<{
  key: EntityStatusFilter;
  icon: React.ReactNode;
}> = [
  {
    key: "all",
    icon: <List className="size-3.5" aria-hidden="true" />,
  },
  {
    key: "not-translated",
    icon: (
      <XCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
    ),
  },
  {
    key: "translated",
    icon: (
      <Check
        className="size-3.5 text-emerald-600 dark:text-emerald-500"
        aria-hidden="true"
      />
    ),
  },
];

export function EntityFilterChips({
  filter,
  onFilterChange,
  targetLocales,
  counts,
}: {
  filter: EntityFilter;
  onFilterChange: (next: EntityFilter) => void;
  targetLocales: CatalogLocale[];
  counts: EntityChipCounts;
}) {
  const t = useT();
  const hasActiveFilter =
    filter.status !== "all" || filter.language !== "all";

  const statusLabel = (key: EntityStatusFilter): string =>
    key === "all"
      ? t("common.all")
      : key === "not-translated"
        ? t("translations.status_not_translated")
        : t("translations.status_translated");

  return (
    <div className="flex flex-col gap-2">
      {/* Status row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("translations.filter_show")}
        </span>
        {STATUS_OPTIONS.map((opt) => (
          <Chip
            key={opt.key}
            active={filter.status === opt.key}
            onClick={() => onFilterChange({ ...filter, status: opt.key })}
            icon={opt.icon}
            label={statusLabel(opt.key)}
            count={counts.status[opt.key]}
          />
        ))}
        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => onFilterChange(DEFAULT_ENTITY_FILTER)}
            className={cn(
              "ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs",
              "text-muted-foreground hover:text-foreground",
            )}
          >
            <X className="size-3" aria-hidden="true" />
            {t("translations.clear_filter")}
          </button>
        )}
      </div>

      {/* Language row — only meaningful when there's more than one target */}
      {targetLocales.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("translations.language_label")}
          </span>
          <Chip
            active={filter.language === "all"}
            onClick={() => onFilterChange({ ...filter, language: "all" })}
            label={t("common.all")}
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
