"use client";

import * as React from "react";
import { startTransition } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { CatalogLocale } from "./languages-sidebar";
import {
  EntityTranslationEditDialog,
  type EntityFieldKey,
  type EntityForDialog,
  type EntityTranslationLite,
} from "./entity-translation-edit-dialog";
import {
  EntityFilterChips,
  computeEntityChipCounts,
  matchesEntityFilter,
  DEFAULT_ENTITY_FILTER,
  type EntityFilter,
} from "./entity-filter-chips";

/**
 * EntityTranslationsTab — Phase 2 generic worktable.
 *
 * Mirrors the Items tab pattern (KRA-97 pass 2): filter-chip row above
 * the table, no per-tab bulk-translate bar. The previous "Bulk
 * translate: Русский (3) Аzəbajчан дили (7) …" inline button row was
 * replaced with the same Show × Language chip filter the Items tab
 * uses. Bulk translate per (language × kind) reaches us via two
 * surfaces:
 *
 *   1. The header's master "Translate everything missing" CTA fans out
 *      across every (locale × kind) — covers the "translate it all" path.
 *   2. The Overview tab's per-language row carries a Translate button.
 *      (Phase 2 — currently items-only; a future iteration can extend
 *      it to per-kind sub-totals if the merchant signal emerges.)
 *
 * Row click opens the EntityTranslationEditDialog with the source pane
 * editable (KRA-97 Gap 3) and per-locale cards including drift state.
 */

export type EntityRowForTable = {
  id: string;
  name: string;
  description: string | null;
  context: string | null;
  is_active: boolean;
  /** Current hash of the source row's translatable fields. Compared against
   *  each translation row's `source_hash` to detect drift (KRA-90 trigger).
   *  Null when the trigger hasn't fired yet (just-created row). */
  current_source_hash: string | null;
  translations: EntityTranslationLite[];
};

export type EntityTranslationsTabProps = {
  catalogId: string;
  entityKind:
    | "variation"
    | "modifier"
    | "modifier_list"
    | "category"
    | "catalog";
  entityLabel: string;
  /** Plural noun for empty states ("variations", "categories", …). */
  entityLabelPlural: string;
  fields: ReadonlyArray<EntityFieldKey>;
  rows: EntityRowForTable[];
  defaultLocale: CatalogLocale | null;
  targetLocales: CatalogLocale[];
  /** Currently unused — locale-level busy state is carried by the
   *  header pulse instead of per-button spinners on this tab. Kept on
   *  the props so callers don't churn when we wire it later. */
  busyLocales?: ReadonlySet<string>;
  onMutation: () => void;
};

export function EntityTranslationsTab({
  catalogId,
  entityKind,
  entityLabel,
  entityLabelPlural,
  fields,
  rows,
  defaultLocale,
  targetLocales,
  busyLocales: _busyLocales,
  onMutation,
}: EntityTranslationsTabProps) {
  void _busyLocales;
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const editingRow = React.useMemo(
    () => (editingId ? rows.find((r) => r.id === editingId) ?? null : null),
    [editingId, rows],
  );

  // Filter state lives in the tab. Could lift to the panel later if we
  // want an Overview-tab "Find these N variations not translated in
  // Russian" jump button, but for now per-tab state is enough.
  const [filter, setFilter] = React.useState<EntityFilter>(
    DEFAULT_ENTITY_FILTER,
  );

  const chipCounts = React.useMemo(
    () => computeEntityChipCounts(rows, targetLocales, filter),
    [rows, targetLocales, filter],
  );

  const visibleRows = React.useMemo(
    () => rows.filter((row) => matchesEntityFilter(row, filter, targetLocales)),
    [rows, filter, targetLocales],
  );

  // When language=X, narrow columns to that locale only — emphasises
  // the locale being worked on (mirrors Items tab columnsToShow).
  const columnsToShow = React.useMemo(
    () =>
      filter.language === "all"
        ? targetLocales
        : targetLocales.filter((l) => l.locale === filter.language),
    [filter.language, targetLocales],
  );

  // Empty state — no source data at all (no variations / modifiers / etc).
  if (rows.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <h2 className="text-sm font-medium">No {entityLabelPlural} yet</h2>
        <p className="text-xs text-muted-foreground">
          Add {entityLabelPlural} in the catalog first. Once they exist, this
          tab will show their translation coverage by language.
        </p>
      </div>
    );
  }

  // Empty state — has rows but no target locales.
  if (targetLocales.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <h2 className="text-sm font-medium">No target language yet</h2>
        <p className="text-xs text-muted-foreground">
          Add a target language in the sidebar and we&apos;ll show you which
          {" "}{entityLabelPlural} still need translating.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <EntityFilterChips
        filter={filter}
        onFilterChange={setFilter}
        targetLocales={targetLocales}
        counts={chipCounts}
      />

      {visibleRows.length === 0 ? (
        <FilterEmptyState
          entityLabelPlural={entityLabelPlural}
          onClearFilter={() => setFilter(DEFAULT_ENTITY_FILTER)}
        />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="max-w-[280px]">
                  {defaultLocale ? (
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">
                        {defaultLocale.display_name}
                      </span>
                      <Badge
                        variant="outline"
                        className="h-4 px-1.5 text-[10px]"
                      >
                        default
                      </Badge>
                    </span>
                  ) : (
                    "Source"
                  )}
                </TableHead>
                {columnsToShow.map((locale) => (
                  <TableHead key={locale.locale} className="max-w-[280px]">
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
              {visibleRows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => setEditingId(row.id)}
                  className={cn(
                    "cursor-pointer hover:bg-muted/40",
                    !row.is_active && "opacity-60",
                  )}
                >
                  <TableCell className="max-w-[280px] align-top">
                    <div className="flex min-w-0 max-w-[280px] flex-col gap-0.5">
                      <span
                        className="truncate font-medium"
                        title={row.name}
                      >
                        {row.name}
                      </span>
                      {row.context && (
                        <span
                          className="truncate text-[11px] text-muted-foreground"
                          title={row.context}
                        >
                          {row.context}
                        </span>
                      )}
                      {fields.includes("description") && row.description && (
                        <span
                          className="line-clamp-2 text-xs text-muted-foreground"
                          title={row.description}
                        >
                          {row.description}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  {columnsToShow.map((locale) => {
                    const t = row.translations.find(
                      (tr) => tr.locale === locale.locale,
                    );
                    // Drift detection (KRA-97 Gap 4): a translation
                    // exists but its captured source_hash no longer
                    // matches the parent's current_source_hash, meaning
                    // the source row was edited after this translation
                    // was generated. Surfaced as a subtle amber dot
                    // beside the translated name — discoverable via the
                    // row's own dialog where the re-translate button
                    // lives.
                    const isDrift =
                      !!t &&
                      !!row.current_source_hash &&
                      !!t.source_hash &&
                      t.source_hash !== row.current_source_hash;
                    return (
                      <TableCell
                        key={locale.locale}
                        className="max-w-[280px] align-top"
                      >
                        {t ? (
                          <div className="flex min-w-0 max-w-[280px] items-start gap-1.5">
                            {isDrift && (
                              <span
                                className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-amber-500"
                                aria-hidden="true"
                                title="Source changed since translation — may need re-translate"
                              />
                            )}
                            <span
                              className="block min-w-0 truncate text-sm font-medium"
                              title={
                                isDrift
                                  ? `${t.name} (source changed — may need re-translate)`
                                  : t.name
                              }
                            >
                              {t.name}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span
                              className="inline-block size-1.5 rounded-full bg-muted-foreground/40"
                              aria-hidden="true"
                            />
                            Not translated
                          </div>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editingRow && (
        <EntityTranslationEditDialog
          open
          onOpenChange={(open) => !open && setEditingId(null)}
          entityKind={entityKind}
          entityLabel={entityLabel}
          fields={fields}
          catalogId={catalogId}
          entity={toDialogEntity(editingRow)}
          defaultLocale={defaultLocale}
          targetLocales={targetLocales}
          onMutation={() => startTransition(() => onMutation())}
        />
      )}
    </div>
  );
}

function toDialogEntity(row: EntityRowForTable): EntityForDialog {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    context: row.context,
    current_source_hash: row.current_source_hash,
    translations: row.translations,
  };
}

function FilterEmptyState({
  entityLabelPlural,
  onClearFilter,
}: {
  entityLabelPlural: string;
  onClearFilter: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed bg-muted/20 py-12 text-center">
      <p className="text-sm font-medium">
        No {entityLabelPlural} match this filter.
      </p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Try a different status or language combination, or clear the filter
        to see all {entityLabelPlural}.
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
