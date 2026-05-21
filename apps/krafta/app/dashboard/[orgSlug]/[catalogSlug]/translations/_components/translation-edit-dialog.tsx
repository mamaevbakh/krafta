"use client";

import * as React from "react";
import { Loader2, Sparkles, X, Bot, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  enqueueTranslationJob,
  updateTranslation,
  applyAiTranslation,
} from "@/lib/translation/actions";
import type { CatalogLocale } from "./languages-sidebar";
import type { ItemRow, ItemTranslation } from "./items-tab";

/**
 * Per-item translation editor (fullscreen dialog).
 *
 * Replaces the side drawer (vaul) with a fullscreen shadcn Dialog so the
 * editor has room to breathe. Layout:
 *
 *   - Sticky top bar: close button + "Translate item · {name}"
 *   - Two-pane body (lg+):
 *       Left  — source pane (default-locale, read-only), pinned + scrollable
 *       Right — target-locale forms stacked, one card per locale
 *     On mobile / narrow viewports the source stacks ABOVE the targets so
 *     the merchant always sees what they're translating from at a glance.
 *
 * Three actions per target locale (unchanged from the drawer):
 *   1. "Translate with AI" → enqueueTranslationJob (single item, force=true)
 *   2. Manual edit + Save → updateTranslation (flips is_ai_translated=false,
 *      writes last_edited_by=auth.uid())
 *   3. "Accept" — visible only when is_ai_translated=true, flips the AI
 *      badge to "reviewed" without changing the text.
 *
 * Form state is preserved across item-prop refreshes: dirty forms aren't
 * overwritten when the worker writes back AI translations.
 */

export type TranslationEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ItemRow;
  defaultLocale: CatalogLocale | null;
  targetLocales: CatalogLocale[];
  catalogId: string;
  onMutation: () => void;
};

type LocaleFormState = {
  name: string;
  description: string;
  image_alt: string;
  /** Diff vs. the loaded translation row */
  dirty: boolean;
  /** Source-of-truth from server */
  serverRow: ItemTranslation | null;
};

function initialFormState(
  translation: ItemTranslation | undefined,
): LocaleFormState {
  if (!translation) {
    return {
      name: "",
      description: "",
      image_alt: "",
      dirty: false,
      serverRow: null,
    };
  }
  return {
    name: translation.name,
    description: translation.description ?? "",
    image_alt: translation.image_alt ?? "",
    dirty: false,
    serverRow: translation,
  };
}

export function TranslationEditDialog({
  open,
  onOpenChange,
  item,
  defaultLocale,
  targetLocales,
  catalogId,
  onMutation,
}: TranslationEditDialogProps) {
  // Per-locale form state, keyed by locale code.
  const [forms, setForms] = React.useState<Record<string, LocaleFormState>>(
    () => {
      const initial: Record<string, LocaleFormState> = {};
      for (const locale of targetLocales) {
        const translation = item.item_translations.find(
          (t) => t.locale === locale.locale,
        );
        initial[locale.locale] = initialFormState(translation);
      }
      return initial;
    },
  );

  // Per-locale "AI-translating" + "saving" state.
  const [aiPending, setAiPending] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState<Set<string>>(new Set());

  // When the item prop changes (refresh after AI completes), sync forms.
  // Only reset rows where the form isn't dirty — preserve unsaved edits.
  React.useEffect(() => {
    setForms((prev) => {
      const next: Record<string, LocaleFormState> = { ...prev };
      for (const locale of targetLocales) {
        const translation = item.item_translations.find(
          (t) => t.locale === locale.locale,
        );
        const current = prev[locale.locale];
        if (!current || !current.dirty) {
          next[locale.locale] = initialFormState(translation);
        } else {
          // Update server source-of-truth without touching the dirty form.
          next[locale.locale] = { ...current, serverRow: translation ?? null };
        }
      }
      return next;
    });
  }, [item, targetLocales]);

  const updateField = (
    locale: string,
    field: "name" | "description" | "image_alt",
    value: string,
  ) => {
    setForms((prev) => {
      const current = prev[locale] ?? initialFormState(undefined);
      const next = { ...current, [field]: value, dirty: true };
      return { ...prev, [locale]: next };
    });
  };

  const handleAiTranslate = async (locale: CatalogLocale) => {
    setAiPending((prev) => new Set(prev).add(locale.locale));
    const result = await enqueueTranslationJob({
      catalogId,
      targetLocale: locale.locale,
      entityKind: "item",
      entityIds: [item.id],
      // Single-item dialog click = explicit "AI translate this row." Force
      // through human-edit protection — the merchant explicitly asked.
      force: true,
    });

    if (!result.ok) {
      setAiPending((prev) => {
        const next = new Set(prev);
        next.delete(locale.locale);
        return next;
      });
      toast.error(result.error);
      return;
    }

    toast.success(`Translating to ${locale.display_name}…`);

    // Worker runs on a 60s cron OR responds to direct invocation; either
    // way the round-trip is ~5-10s. Refresh after 8s to pull the result.
    setTimeout(() => {
      onMutation();
      setAiPending((prev) => {
        const next = new Set(prev);
        next.delete(locale.locale);
        return next;
      });
    }, 8000);
  };

  const handleSave = async (locale: CatalogLocale) => {
    const form = forms[locale.locale];
    if (!form || !form.dirty) return;

    setSaving((prev) => new Set(prev).add(locale.locale));

    const fields = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      image_alt: form.image_alt.trim() || null,
    };

    if (!fields.name) {
      toast.error("Name is required.");
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(locale.locale);
        return next;
      });
      return;
    }

    // Phase 1 limitation: manual translation of a fresh locale must first
    // go through AI (which creates the row), then merchant edits.
    if (!form.serverRow) {
      toast.error(
        "Use 'Translate with AI' first for this language, then edit the result.",
      );
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(locale.locale);
        return next;
      });
      return;
    }

    const result = await updateTranslation({
      entityKind: "item",
      translationRowId: form.serverRow.id,
      fields,
    });
    setSaving((prev) => {
      const next = new Set(prev);
      next.delete(locale.locale);
      return next;
    });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Saved ${locale.display_name}`);
    setForms((prev) => ({
      ...prev,
      [locale.locale]: { ...form, dirty: false },
    }));
    onMutation();
  };

  const handleAccept = async (locale: CatalogLocale) => {
    const form = forms[locale.locale];
    if (!form?.serverRow) return;
    const result = await applyAiTranslation({
      entityKind: "item",
      translationRowId: form.serverRow.id,
      accept: true,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Accepted ${locale.display_name}`);
    onMutation();
  };

  // How many forms have unsaved edits — drives the dirty-count badge in
  // the header so the merchant doesn't lose track of pending work.
  const dirtyCount = Object.values(forms).filter((f) => f.dirty).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Default DialogContent ships a corner X; we put our own in the
        // sticky header so the close action sits in a predictable spot
        // alongside the title.
        showCloseButton={false}
        // Fullscreen override. Default DialogContent is centered with
        // sm:max-w-lg; these classes flatten it to viewport-filling.
        // Tailwind-merge in cn() resolves conflicting top/left/translate
        // /max-w utilities — explicit sm:max-w-none defeats the sm: prefix.
        className={cn(
          "top-0 left-0 translate-x-0 translate-y-0",
          "h-screen w-screen max-w-none sm:max-w-none",
          "rounded-none border-0 p-0 gap-0",
          "flex flex-col",
        )}
      >
        <DialogTitle className="sr-only">
          Translate item: {item.name}
        </DialogTitle>

        {/* Sticky top bar */}
        <header className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-3 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => onOpenChange(false)}
            aria-label="Close translation editor"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">
              Translate item
            </span>
            <h2 className="truncate text-base font-semibold tracking-tight">
              {item.name}
            </h2>
          </div>
          {dirtyCount > 0 && (
            <Badge variant="outline" className="shrink-0 gap-1">
              <span className="text-amber-600 dark:text-amber-500">●</span>
              {dirtyCount} unsaved
            </Badge>
          )}
        </header>

        {/* Two-pane body. On lg+ source pins to the left while targets
            scroll on the right. On mobile/tablet the source stacks above
            the targets so the merchant always has reference text in view. */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* SOURCE PANE (left on desktop, top on mobile) */}
          <aside
            className={cn(
              "shrink-0 overflow-auto bg-muted/20",
              "border-b lg:w-80 lg:border-b-0 lg:border-r",
              // Cap mobile height so it doesn't push the targets off
              // the visible viewport. lg+ uses the natural flex height.
              "max-h-[40vh] lg:max-h-none",
            )}
            aria-label="Source content"
          >
            <div className="flex flex-col gap-4 p-4 md:p-6">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="h-5">
                  {defaultLocale?.display_name ?? "Source"}
                </Badge>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  default · read-only
                </span>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">
                    Name
                  </Label>
                  <p
                    className="text-sm font-medium"
                    lang={defaultLocale?.locale}
                  >
                    {item.name}
                  </p>
                </div>

                {item.description && (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">
                      Description
                    </Label>
                    <p
                      className="whitespace-pre-wrap text-sm leading-relaxed"
                      lang={defaultLocale?.locale}
                    >
                      {item.description}
                    </p>
                  </div>
                )}

                {item.image_alt && (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">
                      Image alt
                    </Label>
                    <p
                      className="text-sm leading-relaxed"
                      lang={defaultLocale?.locale}
                    >
                      {item.image_alt}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* TARGETS PANE (right on desktop, below on mobile) */}
          <main className="min-w-0 flex-1 overflow-auto">
            <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:p-6">
              {targetLocales.map((locale) => {
                const form =
                  forms[locale.locale] ?? initialFormState(undefined);
                const serverRow = form.serverRow;
                const showAccept =
                  serverRow && serverRow.is_ai_translated && !form.dirty;
                const stale =
                  serverRow &&
                  item.current_source_hash !== null &&
                  serverRow.source_hash !== null &&
                  item.current_source_hash !== serverRow.source_hash;

                return (
                  <section
                    key={locale.locale}
                    className={cn(
                      "flex flex-col gap-3 rounded-lg border bg-card p-4 md:p-5",
                      form.dirty && "ring-1 ring-amber-500/30",
                    )}
                  >
                    {/* Locale header — name + badges + per-locale actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          className="text-sm font-semibold"
                          lang={locale.locale}
                        >
                          {locale.display_name}
                        </h3>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {locale.locale}
                        </span>
                        {serverRow?.is_ai_translated && (
                          <Badge
                            variant="secondary"
                            className="h-5 gap-0.5 text-[10px]"
                          >
                            <Bot className="size-3" aria-hidden="true" />
                            AI — review
                          </Badge>
                        )}
                        {stale && (
                          <Badge
                            variant="outline"
                            className="h-5 gap-0.5 text-[10px]"
                          >
                            <AlertCircle
                              className="size-3"
                              aria-hidden="true"
                            />
                            stale
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant={serverRow ? "outline" : "default"}
                          size="sm"
                          onClick={() => handleAiTranslate(locale)}
                          disabled={aiPending.has(locale.locale)}
                        >
                          {aiPending.has(locale.locale) ? (
                            <>
                              <Loader2 className="size-3.5 animate-spin" />
                              Translating…
                            </>
                          ) : (
                            <>
                              <Sparkles className="size-3.5" />
                              {serverRow ? "Retranslate" : "Translate with AI"}
                            </>
                          )}
                        </Button>
                        {showAccept && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAccept(locale)}
                          >
                            Accept
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Form fields */}
                    <div
                      dir={locale.text_direction}
                      className="flex flex-col gap-3"
                    >
                      <div className="flex flex-col gap-1.5">
                        <Label
                          htmlFor={`name-${locale.locale}`}
                          className="text-xs"
                        >
                          Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id={`name-${locale.locale}`}
                          value={form.name}
                          onChange={(e) =>
                            updateField(locale.locale, "name", e.target.value)
                          }
                          placeholder={`${item.name} (${locale.display_name})`}
                          disabled={
                            !serverRow && !form.dirty && form.name === ""
                          }
                          lang={locale.locale}
                        />
                      </div>
                      {item.description && (
                        <div className="flex flex-col gap-1.5">
                          <Label
                            htmlFor={`desc-${locale.locale}`}
                            className="text-xs"
                          >
                            Description
                          </Label>
                          <Textarea
                            id={`desc-${locale.locale}`}
                            value={form.description}
                            onChange={(e) =>
                              updateField(
                                locale.locale,
                                "description",
                                e.target.value,
                              )
                            }
                            rows={5}
                            placeholder="Translate the description"
                            lang={locale.locale}
                          />
                        </div>
                      )}
                      {item.image_alt && (
                        <div className="flex flex-col gap-1.5">
                          <Label
                            htmlFor={`alt-${locale.locale}`}
                            className="text-xs"
                          >
                            Image alt text
                          </Label>
                          <Input
                            id={`alt-${locale.locale}`}
                            value={form.image_alt}
                            onChange={(e) =>
                              updateField(
                                locale.locale,
                                "image_alt",
                                e.target.value,
                              )
                            }
                            lang={locale.locale}
                          />
                        </div>
                      )}
                    </div>

                    {/* Per-locale Save row — only renders when dirty */}
                    {form.dirty && (
                      <div className="flex items-center justify-end gap-2 border-t pt-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setForms((prev) => ({
                              ...prev,
                              [locale.locale]: initialFormState(
                                form.serverRow ?? undefined,
                              ),
                            }))
                          }
                          disabled={saving.has(locale.locale)}
                        >
                          Discard
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleSave(locale)}
                          disabled={saving.has(locale.locale)}
                        >
                          {saving.has(locale.locale) ? (
                            <>
                              <Loader2 className="size-3.5 animate-spin" />
                              Saving…
                            </>
                          ) : (
                            "Save"
                          )}
                        </Button>
                      </div>
                    )}
                  </section>
                );
              })}

              <p className="pt-2 text-center text-[11px] text-muted-foreground">
                Manual edits override AI translations. AI re-translation will
                skip human-edited rows unless you explicitly retranslate.
              </p>
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
