"use client";

import * as React from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  enqueueTranslationJob,
  updateEntitySourceText,
  updateTranslation,
} from "@/lib/translation/actions";
import type { CatalogLocale } from "./languages-sidebar";

/**
 * EntityTranslationEditDialog — Phase 2 generic edit surface.
 *
 * Replaces the Items-specific TranslationEditDialog for variations,
 * modifiers, modifier_lists, and categories. Same fullscreen pattern;
 * trimmer because most non-item entities only have a `name` field.
 *
 * Key differences vs the Items dialog:
 *   - Source is editable (KRA-97 Gap 3). Wired via the generic
 *     `updateEntitySourceText` action — the merchant can correct a typo
 *     in the source row without leaving the workbench. Editing the
 *     source flips downstream translation rows into "drift" (their
 *     source_hash no longer matches the parent's current_source_hash);
 *     the dialog surfaces a re-translate hint per locale when that
 *     happens.
 *   - Field schema is configurable. Pass `fields=["name"]` for the
 *     name-only entities, `fields=["name", "description"]` for categories.
 *   - Sticks to the same "translate-with-AI then edit" gate the items
 *     dialog enforces (updateTranslation needs a translationRowId, which
 *     only exists once the worker has written a row).
 */

export type EntityFieldKey = "name" | "description";

export type EntityTranslationLite = {
  id: string;
  locale: string;
  name: string;
  description: string | null;
  is_ai_translated: boolean;
  /** Hash of the source row at the time this translation was generated.
   *  Compared against the parent's `current_source_hash` to detect drift
   *  (source changed after translation). KRA-97 surfaces this per row. */
  source_hash: string | null;
};

export type EntityForDialog = {
  id: string;
  /** Source name in the default locale. */
  name: string;
  /** Source description (categories + items only); null when n/a. */
  description: string | null;
  /** Optional context line shown under the source name — e.g. parent item
   *  name for a variation, parent list name for a modifier. Helps the
   *  merchant disambiguate "Small" from "Small (Coffee) vs Small (Tea)." */
  context: string | null;
  /** Current hash of the source's translatable fields. Used to compute
   *  drift state per translation row. */
  current_source_hash: string | null;
  translations: EntityTranslationLite[];
};

export type EntityTranslationEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which entity kind drives the translation table + enqueue payload. */
  entityKind: "variation" | "modifier" | "modifier_list" | "category";
  /** Which fields of the entity are user-editable. "name" always; "description"
   *  only for categories (and future entities with descriptions). */
  fields: ReadonlyArray<EntityFieldKey>;
  /** Singular noun for empty states / copy ("variation", "category", …). */
  entityLabel: string;
  catalogId: string;
  entity: EntityForDialog;
  defaultLocale: CatalogLocale | null;
  targetLocales: CatalogLocale[];
  onMutation: () => void;
};

// Source form mirrors TargetForm but lives outside the per-locale map.
// Only `name` is universally editable; `description` honours the
// dialog's `fields` config so name-only kinds don't render a textarea.
type SourceForm = {
  name: string;
  description: string;
  dirty: boolean;
};

// ============================================================================
// Form state
// ============================================================================

type TargetForm = {
  /** Existing DB row for (entity × locale), or null if no row yet. */
  serverRow: EntityTranslationLite | null;
  /** Editable working copy of the targeted fields. */
  fields: Record<EntityFieldKey, string | null>;
  dirty: boolean;
};

function buildForm(
  fields: ReadonlyArray<EntityFieldKey>,
  serverRow: EntityTranslationLite | null,
): TargetForm {
  const seeded: Record<EntityFieldKey, string | null> = {
    name: serverRow?.name ?? "",
    description:
      fields.includes("description") ? serverRow?.description ?? "" : null,
  };
  return { serverRow, fields: seeded, dirty: false };
}

export function EntityTranslationEditDialog({
  open,
  onOpenChange,
  entityKind,
  fields,
  entityLabel,
  catalogId,
  entity,
  defaultLocale,
  targetLocales,
  onMutation,
}: EntityTranslationEditDialogProps) {
  // Per-target form state, keyed by locale code.
  const [forms, setForms] = React.useState<Record<string, TargetForm>>({});
  // Source-pane form (KRA-97 Gap 3 — symmetric source edit). Separate
  // state from `forms` because source dirtiness has its own save action.
  const [sourceForm, setSourceForm] = React.useState<SourceForm>({
    name: "",
    description: "",
    dirty: false,
  });
  const [savingSource, setSavingSource] = React.useState(false);

  // Translation rows in-flight via the AI worker — keyed by locale so
  // we can show a per-card spinner without blocking the rest of the UI.
  const [translatingLocales, setTranslatingLocales] = React.useState<
    Set<string>
  >(new Set());
  const [savingLocales, setSavingLocales] = React.useState<Set<string>>(
    new Set(),
  );
  const [savingAll, setSavingAll] = React.useState(false);

  // Seed forms on open / when the underlying entity changes.
  React.useEffect(() => {
    if (!open) return;
    const next: Record<string, TargetForm> = {};
    for (const locale of targetLocales) {
      const row =
        entity.translations.find((t) => t.locale === locale.locale) ?? null;
      next[locale.locale] = buildForm(fields, row);
    }
    setForms(next);
    setSourceForm({
      name: entity.name ?? "",
      description: entity.description ?? "",
      dirty: false,
    });
    setTranslatingLocales(new Set());
    setSavingLocales(new Set());
    setSavingAll(false);
    setSavingSource(false);
  }, [open, entity, fields, targetLocales]);

  const dirtyCount = React.useMemo(
    () => Object.values(forms).filter((f) => f.dirty).length,
    [forms],
  );
  const sourceDirty = sourceForm.dirty;

  function updateField(
    locale: string,
    key: EntityFieldKey,
    value: string,
  ) {
    setForms((prev) => {
      const current = prev[locale];
      if (!current) return prev;
      return {
        ...prev,
        [locale]: {
          ...current,
          fields: { ...current.fields, [key]: value },
          dirty: true,
        },
      };
    });
  }

  async function handleTranslateLocale(locale: CatalogLocale) {
    setTranslatingLocales((prev) => new Set(prev).add(locale.locale));
    const result = await enqueueTranslationJob({
      catalogId,
      targetLocale: locale.locale,
      entityKind,
      entityIds: [entity.id],
      // Force=true here — when the merchant explicitly clicks "Translate
      // with AI" inside the edit dialog they want a fresh AI rewrite,
      // even if there's a human edit on the row. The bulk button is the
      // surface that protects merchant edits.
      force: true,
    });
    setTranslatingLocales((prev) => {
      const next = new Set(prev);
      next.delete(locale.locale);
      return next;
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Queued translation into ${locale.display_name}.`);
    onMutation();
  }

  async function handleSaveLocale(
    locale: CatalogLocale,
    options: { silent?: boolean } = {},
  ): Promise<boolean> {
    const form = forms[locale.locale];
    if (!form) return false;

    const name = (form.fields.name ?? "").trim();
    if (!name) {
      if (!options.silent) toast.error("Name is required.");
      return false;
    }

    if (!form.serverRow) {
      if (!options.silent) {
        toast.error(
          `Use "Translate with AI" first for ${locale.display_name}, then edit the result.`,
        );
      }
      return false;
    }

    setSavingLocales((prev) => new Set(prev).add(locale.locale));
    const payload: Record<string, string | null> = { name };
    if (fields.includes("description")) {
      const desc = form.fields.description?.trim() ?? "";
      payload.description = desc.length === 0 ? null : desc;
    }

    const result = await updateTranslation({
      entityKind,
      translationRowId: form.serverRow.id,
      fields: payload,
    });
    setSavingLocales((prev) => {
      const next = new Set(prev);
      next.delete(locale.locale);
      return next;
    });

    if (!result.ok) {
      if (!options.silent) toast.error(result.error);
      return false;
    }
    // Mark form clean locally; the parent refresh re-seeds with fresh DB data.
    setForms((prev) => ({
      ...prev,
      [locale.locale]: { ...form, dirty: false },
    }));
    if (!options.silent) {
      toast.success(`Saved ${locale.display_name}.`);
      onMutation();
    }
    return true;
  }

  async function handleSaveAll() {
    setSavingAll(true);
    let saved = 0;
    let failedAny = false;
    for (const locale of targetLocales) {
      const f = forms[locale.locale];
      if (f?.dirty) {
        const ok = await handleSaveLocale(locale, { silent: true });
        if (ok) saved += 1;
        else failedAny = true;
      }
    }
    setSavingAll(false);
    if (failedAny && saved === 0) {
      // Per-locale errors fired silently — surface a single combined error.
      toast.error("Some translations failed to save.");
    } else if (saved > 0) {
      toast.success(`Saved ${saved} translation${saved === 1 ? "" : "s"}.`);
      onMutation();
    }
  }

  async function handleSaveSource(): Promise<boolean> {
    const name = sourceForm.name.trim();
    if (!name) {
      toast.error("Source name is required.");
      return false;
    }
    setSavingSource(true);
    // For category we pass description explicitly (so empty clears it).
    // Other kinds don't have description on the parent so we omit it
    // entirely and the server ignores anything else.
    const payload: Parameters<typeof updateEntitySourceText>[0] = {
      catalogId,
      entityKind,
      entityId: entity.id,
      name,
    };
    if (fields.includes("description")) {
      const desc = sourceForm.description.trim();
      payload.description = desc.length === 0 ? null : desc;
    }
    const result = await updateEntitySourceText(payload);
    setSavingSource(false);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    setSourceForm((prev) => ({ ...prev, dirty: false }));
    toast.success("Source updated. Existing translations may now drift.");
    onMutation();
    return true;
  }

  function handleClose() {
    if (dirtyCount > 0 || sourceDirty) {
      if (!window.confirm("Discard unsaved changes?")) return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          // Fullscreen — same chrome the Items dialog uses
          "top-0 left-0 translate-x-0 translate-y-0",
          "h-screen w-screen max-w-none sm:max-w-none",
          "rounded-none border-0 p-0 gap-0 flex flex-col",
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b px-6 py-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-lg font-semibold">
              {entity.name || `Untitled ${entityLabel}`}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Editing translations for this {entityLabel}.
              {entity.context ? ` ${entity.context}.` : ""}
            </DialogDescription>
          </div>
          {dirtyCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              ● {dirtyCount} unsaved
            </span>
          )}
          <Button
            onClick={handleSaveAll}
            disabled={dirtyCount === 0 || savingAll}
            size="sm"
          >
            {savingAll ? (
              <>
                <Loader2
                  className="size-3.5 animate-spin"
                  aria-hidden="true"
                />
                Saving…
              </>
            ) : (
              `Save all${dirtyCount > 0 ? ` (${dirtyCount})` : ""}`
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            aria-label="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        {/* Body — source (left, narrow) + targets (right, scroll) */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Source pane — editable (KRA-97 Gap 3). Mirrors the Items
              dialog so the merchant has one consistent place to fix
              source-text typos while reviewing translations. Editing
              the source flips downstream translation rows into drift;
              the dialog's row cards highlight that state. */}
          <aside className="hidden w-80 shrink-0 overflow-y-auto border-r bg-muted/20 px-6 py-5 lg:block">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Source
                  </span>
                  {defaultLocale && (
                    <span className="text-xs text-muted-foreground">
                      {defaultLocale.display_name}
                    </span>
                  )}
                </div>
                {sourceDirty && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                    ● unsaved
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="source-name"
                  className="text-[11px] uppercase tracking-wide text-muted-foreground"
                >
                  Name
                </Label>
                <Input
                  id="source-name"
                  value={sourceForm.name}
                  onChange={(e) =>
                    setSourceForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                      dirty: true,
                    }))
                  }
                  placeholder={`${entityLabel} name`}
                  dir={defaultLocale?.text_direction ?? "ltr"}
                  className="h-9"
                />
              </div>
              {fields.includes("description") && (
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="source-description"
                    className="text-[11px] uppercase tracking-wide text-muted-foreground"
                  >
                    Description
                  </Label>
                  <Textarea
                    id="source-description"
                    value={sourceForm.description}
                    onChange={(e) =>
                      setSourceForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                        dirty: true,
                      }))
                    }
                    placeholder="Optional"
                    dir={defaultLocale?.text_direction ?? "ltr"}
                    rows={4}
                  />
                </div>
              )}
              <Button
                size="sm"
                onClick={() => handleSaveSource()}
                disabled={!sourceDirty || savingSource}
                className="h-7 self-start text-xs font-normal"
              >
                {savingSource ? (
                  <>
                    <Loader2
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                    Saving…
                  </>
                ) : (
                  "Save source"
                )}
              </Button>
              <p className="pt-2 text-[11px] text-muted-foreground">
                Editing the source flags existing translations as drift —
                they may need a re-translate.
              </p>
            </div>
          </aside>

          {/* Targets grid */}
          <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              {targetLocales.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No target languages yet. Add one in the sidebar to translate.
                </p>
              )}
              {targetLocales.map((locale) => {
                const form = forms[locale.locale];
                if (!form) return null;
                const isTranslating = translatingLocales.has(locale.locale);
                const isSaving = savingLocales.has(locale.locale);
                const isMissing = form.serverRow === null;
                // Drift state (KRA-97 Gap 4): the translation row's
                // captured source_hash no longer matches the parent
                // entity's current_source_hash, meaning the source row
                // was edited after this translation was generated. The
                // dialog highlights the locale card with an amber chip
                // so the merchant knows to re-translate or hand-edit.
                const isDrift =
                  !isMissing &&
                  !!entity.current_source_hash &&
                  !!form.serverRow?.source_hash &&
                  form.serverRow.source_hash !== entity.current_source_hash;
                return (
                  <div
                    key={locale.locale}
                    className={cn(
                      "rounded-md border bg-card p-4",
                      form.dirty && "ring-1 ring-amber-500/30",
                    )}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-baseline gap-1.5">
                        <h3
                          className="text-sm font-medium"
                          lang={locale.locale}
                        >
                          {locale.display_name}
                        </h3>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {locale.locale}
                        </span>
                        {isMissing && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                            Not translated yet
                          </span>
                        )}
                        {isDrift && (
                          <span
                            className="ml-2 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                            title="Source changed since this translation was generated"
                          >
                            ● source drift
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTranslateLocale(locale)}
                          disabled={isTranslating || isSaving}
                          className="h-7 gap-1.5 text-xs font-normal"
                        >
                          {isTranslating ? (
                            <Loader2
                              className="size-3.5 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Sparkles
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          )}
                          {isMissing ? "Translate with AI" : "Re-translate"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveLocale(locale)}
                          disabled={!form.dirty || isSaving || isMissing}
                          className="h-7 text-xs font-normal"
                        >
                          {isSaving ? (
                            <>
                              <Loader2
                                className="size-3.5 animate-spin"
                                aria-hidden="true"
                              />
                              Saving…
                            </>
                          ) : (
                            "Save"
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label
                          htmlFor={`tname-${locale.locale}`}
                          className="text-xs"
                        >
                          Name
                        </Label>
                        <Input
                          id={`tname-${locale.locale}`}
                          value={form.fields.name ?? ""}
                          onChange={(e) =>
                            updateField(locale.locale, "name", e.target.value)
                          }
                          placeholder={
                            isMissing
                              ? "Use 'Translate with AI' first"
                              : entity.name
                          }
                          dir={locale.text_direction}
                          disabled={isMissing}
                        />
                      </div>
                      {fields.includes("description") && (
                        <div className="flex flex-col gap-1.5">
                          <Label
                            htmlFor={`tdesc-${locale.locale}`}
                            className="text-xs"
                          >
                            Description
                          </Label>
                          <Textarea
                            id={`tdesc-${locale.locale}`}
                            value={form.fields.description ?? ""}
                            onChange={(e) =>
                              updateField(
                                locale.locale,
                                "description",
                                e.target.value,
                              )
                            }
                            placeholder={
                              isMissing
                                ? "—"
                                : entity.description ?? "Optional"
                            }
                            dir={locale.text_direction}
                            disabled={isMissing}
                            rows={3}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
