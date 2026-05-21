"use client";

import * as React from "react";
import { startTransition } from "react";
import { Bot, AlertCircle, Check } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { TranslationEditDialog } from "./translation-edit-dialog";
import type { CatalogLocale } from "./languages-sidebar";
import {
  ItemsFilterChips,
  computeChipCounts,
  matchesFilter,
  type ItemsFilter,
} from "./items-filter-chips";

/**
 * Items tab — the Phase 1 worktable.
 *
 * Layout:
 *   - Filter chips (sticky top) — Status × Language two-axis filter
 *   - Action bar — bulk "Translate missing → {locale}" buttons per language
 *   - Table — one column per locale showing translated text or status badge
 *
 * Row click opens the TranslationEditDrawer for that item, with all enabled
 * target locales pre-filled in editable columns.
 *
 * Filter state is controlled by the parent (TranslationsPanel) so the
 * Overview tab's "Find these N" CTAs can pre-set both chips before
 * switching to this tab.
 */

export type ItemTranslation = {
  id: string;
  locale: string;
  name: string;
  description: string | null;
  image_alt: string | null;
  is_ai_translated: boolean;
  last_edited_by: string | null;
  source_hash: string | null;
  updated_at: string;
};

export type ItemRow = {
  id: string;
  name: string;
  description: string | null;
  image_alt: string | null;
  is_active: boolean;
  position: number;
  current_source_hash: string | null;
  item_translations: ItemTranslation[];
};

export type ItemsTabProps = {
  catalogId: string;
  defaultLocale: CatalogLocale | null;
  targetLocales: CatalogLocale[];
  items: ItemRow[];
  filter: ItemsFilter;
  onFilterChange: (next: ItemsFilter) => void;
  onMutation: () => void;
  /**
   * Item IDs whose translations just changed via realtime. Used to
   * paint a soft amber highlight on the affected rows for ~2.5s so
   * the merchant sees "this row just updated." Items expire from the
   * set individually; the row class re-evaluates on every render.
   */
  recentlyUpdated?: ReadonlySet<string>;
};

type CellStatus =
  | { kind: "translated"; text: string; needsReview: boolean; stale: boolean }
  | { kind: "missing" };

function getCellStatus(
  item: ItemRow,
  locale: string,
): CellStatus {
  const t = item.item_translations.find((tr) => tr.locale === locale);
  if (!t) return { kind: "missing" };

  // Drift detection: stored source_hash should equal the parent's current.
  // Bytea comes back as hex string with `\x` prefix; compare verbatim.
  const stale =
    item.current_source_hash !== null &&
    t.source_hash !== null &&
    item.current_source_hash !== t.source_hash;

  return {
    kind: "translated",
    text: t.name,
    needsReview: t.is_ai_translated,
    stale,
  };
}

export function ItemsTab({
  catalogId,
  defaultLocale,
  targetLocales,
  items,
  filter,
  onFilterChange,
  onMutation,
  recentlyUpdated,
}: ItemsTabProps) {
  const [drawerItemId, setDrawerItemId] = React.useState<string | null>(null);

  const drawerItem = React.useMemo(
    () => (drawerItemId ? items.find((i) => i.id === drawerItemId) ?? null : null),
    [drawerItemId, items],
  );

  // Counts feed the filter chips. Status counts respect the current
  // language filter so the merchant sees "Russian — 23 not translated"
  // when they're scoped to Russian.
  const chipCounts = React.useMemo(
    () => computeChipCounts(items, targetLocales, filter),
    [items, targetLocales, filter],
  );

  const visibleItems = React.useMemo(
    () => items.filter((item) => matchesFilter(item, filter, targetLocales)),
    [items, filter, targetLocales],
  );

  // When the language filter is set, narrow which target columns show.
  // We keep all of them visible by default — but a single-language filter
  // emphasises the locale being worked on.
  const columnsToShow = React.useMemo(
    () =>
      filter.language === "all"
        ? targetLocales
        : targetLocales.filter((l) => l.locale === filter.language),
    [filter.language, targetLocales],
  );

  if (items.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyContent>
          <EmptyTitle>No items in this catalog</EmptyTitle>
          <EmptyDescription>
            Add items in the Library before translating them. Each item you add
            shows up here automatically.
          </EmptyDescription>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter chips (sticky-friendly — parent sets the bg) */}
      <ItemsFilterChips
        filter={filter}
        onFilterChange={onFilterChange}
        targetLocales={targetLocales}
        counts={chipCounts}
      />

      {/* Action bar (per-language "Translate missing → X" buttons) was
          removed. The header carries the master "Translate everything
          missing" CTA, and the Overview tab's per-language rows host
          the per-language bulk CTAs. Three surfaces for the same action
          was clutter; two cover the routes. The item count moved into
          the filter chips ("All · N") so no information was lost. */}

      {visibleItems.length === 0 ? (
        <FilterEmptyState onClearFilter={() => onFilterChange({ status: "all", language: "all" })} />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {/* w-1/3 dropped — it competed with the cell-level
                    max-w-[280px] cap. Header columns now size to
                    content; cell content does the constraining. */}
                <TableHead className="max-w-[280px]">
                  {defaultLocale ? (
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">
                        {defaultLocale.display_name}
                      </span>
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                        default
                      </Badge>
                    </span>
                  ) : (
                    "Source"
                  )}
                </TableHead>
                {columnsToShow.map((locale) => (
                  <TableHead
                    key={locale.locale}
                    className="max-w-[280px]"
                  >
                    <span className="flex items-center gap-1.5">
                      {locale.display_name}
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {locale.locale}
                      </span>
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleItems.map((item) => {
                const justUpdated = recentlyUpdated?.has(item.id) ?? false;
                return (
                <TableRow
                  key={item.id}
                  onClick={() => setDrawerItemId(item.id)}
                  className={cn(
                    "cursor-pointer transition-colors duration-700",
                    !item.is_active && "opacity-60",
                    // Soft amber highlight when realtime fires for
                    // this row. The transition + the 2.5s TTL in
                    // use-translation-realtime produce a "glow on,
                    // fade out" effect without any keyframe CSS.
                    justUpdated && "bg-amber-500/10",
                  )}
                >
                  <TableCell className="max-w-[280px] align-top">
                    {/* 280px cap per row cell. `min-w-0` lets the
                        truncate utility win against flex's default
                        min-content sizing; `title` exposes the full
                        string on hover so truncation doesn't hide
                        information. */}
                    <div className="flex min-w-0 max-w-[280px] flex-col gap-0.5">
                      <span
                        className="truncate font-medium"
                        title={item.name}
                      >
                        {item.name}
                      </span>
                      {item.description && (
                        <span
                          className="line-clamp-2 text-xs text-muted-foreground"
                          title={item.description}
                        >
                          {item.description}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  {columnsToShow.map((locale) => {
                    const status = getCellStatus(item, locale.locale);
                    return (
                      <TableCell
                        key={locale.locale}
                        className="max-w-[280px] align-top"
                      >
                        <TranslationCell status={status} />
                      </TableCell>
                    );
                  })}
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {drawerItem && (
        <TranslationEditDialog
          open
          onOpenChange={(open) => !open && setDrawerItemId(null)}
          item={drawerItem}
          defaultLocale={defaultLocale}
          targetLocales={targetLocales}
          catalogId={catalogId}
          onMutation={() => {
            startTransition(() => onMutation());
          }}
        />
      )}
    </div>
  );
}

function FilterEmptyState({ onClearFilter }: { onClearFilter: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed bg-muted/20 py-12 text-center">
      <p className="text-sm font-medium">No items match this filter.</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Try a different status or language combination, or clear the filter
        to see all items.
      </p>
      <button
        type="button"
        onClick={onClearFilter}
        className="text-xs text-foreground underline-offset-4 hover:underline"
      >
        Clear filter
      </button>
    </div>
  );
}

// ============================================================================
// TranslationCell — visual for a single (item × locale) cell
// ============================================================================

function TranslationCell({ status }: { status: CellStatus }) {
  if (status.kind === "missing") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="inline-block size-1.5 rounded-full bg-muted-foreground/40" aria-hidden="true" />
        Missing
      </div>
    );
  }

  // 280px cap + truncate. `min-w-0` on the flex column releases the
  // inner span from flex's default min-content sizing so `truncate`
  // (overflow-hidden + text-ellipsis + whitespace-nowrap) takes effect.
  // `title` exposes the full string on hover.
  return (
    <div className="flex min-w-0 max-w-[280px] flex-col gap-1">
      <span
        className={cn(
          "block truncate text-sm font-medium",
          status.stale && "text-muted-foreground",
        )}
        title={status.text}
      >
        {status.text}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {status.stale && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="h-4 gap-0.5 px-1 text-[10px]">
                <AlertCircle className="size-2.5" aria-hidden="true" />
                stale
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              The source text changed since this translation was made. Re-translate
              to refresh.
            </TooltipContent>
          </Tooltip>
        )}
        {status.needsReview ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="h-4 gap-0.5 px-1 text-[10px]">
                <Bot className="size-2.5" aria-hidden="true" />
                AI — review
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              AI generated this translation. Open the row to edit or accept it.
            </TooltipContent>
          </Tooltip>
        ) : (
          !status.stale && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="h-4 gap-0.5 px-1 text-[10px]">
                  <Check className="size-2.5" aria-hidden="true" />
                  reviewed
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Translation reviewed by a human (or accepted).
              </TooltipContent>
            </Tooltip>
          )
        )}
      </div>
    </div>
  );
}

