"use client";

import * as React from "react";
import { startTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

import { enqueueTranslationJob } from "@/lib/translation/actions";
import type { CatalogLocale } from "./languages-sidebar";
import {
  EntityTranslationEditDialog,
  type EntityFieldKey,
  type EntityForDialog,
  type EntityTranslationLite,
} from "./entity-translation-edit-dialog";

/**
 * EntityTranslationsTab — Phase 2 generic worktable.
 *
 * Mirrors the Items tab but operates on any entity kind the worker
 * supports (variation / modifier / modifier_list / category). Same
 * row-per-entity, column-per-locale Table shape; same row-click ⇒
 * fullscreen edit dialog flow.
 *
 * Each tab passes its own `entityKind`, `fields`, and `entityLabel`
 * so the dialog can render the right field set. Per-locale bulk
 * translate buttons live in a small per-language toolbar above the
 * table (one button per target language) — this is the per-tab
 * "Translate all to X" surface Phase 2 requires.
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
  entityKind: "variation" | "modifier" | "modifier_list" | "category";
  entityLabel: string;
  /** Plural noun for empty states ("variations", "categories", …). */
  entityLabelPlural: string;
  fields: ReadonlyArray<EntityFieldKey>;
  rows: EntityRowForTable[];
  defaultLocale: CatalogLocale | null;
  targetLocales: CatalogLocale[];
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
  busyLocales,
  onMutation,
}: EntityTranslationsTabProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const editingRow = React.useMemo(
    () => (editingId ? rows.find((r) => r.id === editingId) ?? null : null),
    [editingId, rows],
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
      {/* Per-language bulk translate row */}
      <PerLocaleBulkBar
        catalogId={catalogId}
        entityKind={entityKind}
        entityLabelPlural={entityLabelPlural}
        rows={rows}
        targetLocales={targetLocales}
        busyLocales={busyLocales}
        onEnqueued={onMutation}
      />

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
              {targetLocales.map((locale) => (
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
            {rows.map((row) => (
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
                {targetLocales.map((locale) => {
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

// ============================================================================
// PerLocaleBulkBar — small inline row of "Translate {N} missing → X" buttons
//
// Mirrors the per-locale bulk button on /translations Items tab Overview
// rows. Lives at the top of each Phase 2 entity tab so the merchant can
// fan out one batch per target language without leaving the worktable.
//
// Each button:
//   - Shows N missing for the language (clickable when N > 0; quiet when 0)
//   - Opens a tiny AlertDialog confirm — same UX as TranslateAllButton
//   - Enqueues a translation_job for this entityKind × locale, force=false
// ============================================================================

function PerLocaleBulkBar({
  catalogId,
  entityKind,
  entityLabelPlural,
  rows,
  targetLocales,
  busyLocales,
  onEnqueued,
}: {
  catalogId: string;
  entityKind: "variation" | "modifier" | "modifier_list" | "category";
  entityLabelPlural: string;
  rows: EntityRowForTable[];
  targetLocales: CatalogLocale[];
  busyLocales?: ReadonlySet<string>;
  onEnqueued: () => void;
}) {
  const stats = React.useMemo(() => {
    return targetLocales.map((locale) => {
      const missingIds: string[] = [];
      for (const row of rows) {
        if (!row.translations.find((t) => t.locale === locale.locale)) {
          missingIds.push(row.id);
        }
      }
      return { locale, missingIds };
    });
  }, [rows, targetLocales]);

  const totalMissing = stats.reduce((acc, s) => acc + s.missingIds.length, 0);

  if (totalMissing === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        All {entityLabelPlural} are translated in every target language.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Bulk translate:</span>
      {stats.map(({ locale, missingIds }) => (
        <PerLocaleBulkButton
          key={locale.locale}
          catalogId={catalogId}
          entityKind={entityKind}
          entityLabelPlural={entityLabelPlural}
          locale={locale}
          missingIds={missingIds}
          isBusy={busyLocales?.has(locale.locale) ?? false}
          onEnqueued={onEnqueued}
        />
      ))}
    </div>
  );
}

function PerLocaleBulkButton({
  catalogId,
  entityKind,
  entityLabelPlural,
  locale,
  missingIds,
  isBusy,
  onEnqueued,
}: {
  catalogId: string;
  entityKind: "variation" | "modifier" | "modifier_list" | "category";
  entityLabelPlural: string;
  locale: CatalogLocale;
  missingIds: string[];
  isBusy: boolean;
  onEnqueued: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  if (missingIds.length === 0) {
    return null;
  }

  async function handleConfirm() {
    setSubmitting(true);
    const result = await enqueueTranslationJob({
      catalogId,
      targetLocale: locale.locale,
      entityKind,
      entityIds: missingIds,
      force: false,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setOpen(false);
    const enqueued = result.enqueued ?? 0;
    toast.success(
      enqueued === 0
        ? "Nothing to translate."
        : `Queued ${enqueued} translation${enqueued === 1 ? "" : "s"}.`,
    );
    onEnqueued();
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={isBusy}
        onClick={() => setOpen(true)}
        className="h-7 gap-1.5 text-xs font-normal"
      >
        {isBusy ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="size-3.5" aria-hidden="true" />
        )}
        {isBusy
          ? `Translating into ${locale.display_name}…`
          : `${locale.display_name} (${missingIds.length})`}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Translate {missingIds.length} {entityLabelPlural} into{" "}
              {locale.display_name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This queues an AI translation for each missing row. Existing
              translations are not touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  Queuing…
                </>
              ) : (
                "Translate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
