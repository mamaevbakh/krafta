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
 *   - Source is READ-ONLY. The merchant edits source content from the
 *     entity's own page (/items/categories, /items/modifiers, /items
 *     for variations). Surfacing source edit here would mean wiring 4
 *     more parent-table update RPCs for negligible value — the source
 *     pane is mostly used as a reference while typing the target.
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
};

export type EntityForDialog = {
  id: string;
  /** Source name in the default locale — read-only here. */
  name: string;
  /** Source description (categories + items only); null when n/a. */
  description: string | null;
  /** Optional context line shown under the source name — e.g. parent item
   *  name for a variation, parent list name for a modifier. Helps the
   *  merchant disambiguate "Small" from "Small (Coffee) vs Small (Tea)." */
  context: string | null;
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
    setTranslatingLocales(new Set());
    setSavingLocales(new Set());
    setSavingAll(false);
  }, [open, entity, fields, targetLocales]);

  const dirtyCount = React.useMemo(
    () => Object.values(forms).filter((f) => f.dirty).length,
    [forms],
  );

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

  function handleClose() {
    if (dirtyCount > 0) {
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
          {/* Source pane */}
          <aside className="hidden w-80 shrink-0 overflow-y-auto border-r bg-muted/20 px-6 py-5 lg:block">
            <div className="flex flex-col gap-3">
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
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Name
                </Label>
                <p className="text-sm font-medium">{entity.name || "—"}</p>
              </div>
              {fields.includes("description") && (
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Description
                  </Label>
                  <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                    {entity.description || (
                      <span className="italic">No description.</span>
                    )}
                  </p>
                </div>
              )}
              <p className="pt-3 text-[11px] text-muted-foreground">
                Source is edited from the {entityLabel}&rsquo;s own page —
                this dialog focuses on translating it.
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
