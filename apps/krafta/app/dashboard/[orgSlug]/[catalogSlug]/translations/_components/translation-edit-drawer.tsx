"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { Loader2, Sparkles, X, Bot, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  enqueueTranslationJob,
  updateTranslation,
  applyAiTranslation,
} from "@/lib/translation/actions";
import type { CatalogLocale } from "./languages-sidebar";
import type { ItemRow, ItemTranslation } from "./items-tab";

/**
 * Per-item translation editor (drawer).
 *
 * Layout: source (default-locale, read-only) on top + N target-locale forms
 * stacked below. Per-locale: AI-translate button + manual save.
 *
 * Three actions per target locale:
 *   1. "Translate with AI" → enqueueTranslationJob (single item). UI shows a
 *      Loading state until the worker writes the row; router.refresh()
 *      pulls in the result.
 *   2. Manual edit + Save → updateTranslation (sets is_ai_translated=false,
 *      last_edited_by=auth.uid()).
 *   3. "Accept" — visible only when is_ai_translated=true. Flips the badge
 *      from "AI — review" to "reviewed" without changing the text.
 */

export type TranslationEditDrawerProps = {
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
  // Diff vs. the loaded translation row
  dirty: boolean;
  // Source-of-truth from server
  serverRow: ItemTranslation | null;
};

function initialFormState(translation: ItemTranslation | undefined): LocaleFormState {
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

export function TranslationEditDrawer({
  open,
  onOpenChange,
  item,
  defaultLocale,
  targetLocales,
  catalogId,
  onMutation,
}: TranslationEditDrawerProps) {
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

  // Per-locale "AI-translating" state (true while waiting for worker).
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
      force: true, // single-item drawer click = explicit "AI translate this"
    });

    if (!result.ok) {
      setAiPending((prev) => {
        const next = new Set(prev);
        next.delete(locale.locale);
        return next;
      });
      toast.error(
        result.error === "QUOTA_EXCEEDED"
          ? "Daily quota exceeded — try again tomorrow or upgrade."
          : result.error,
      );
      return;
    }

    toast.success(`Translating to ${locale.display_name}…`);

    // Wait a few seconds then refresh. The worker runs every minute via cron
    // but also responds to direct-invocation; either way ~5-10s.
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

    // If no existing row, INSERT via updateTranslation requires a translation
    // row ID. Phase 1 limitation: manual translation of a fresh locale must
    // first go through AI (which creates the row), then merchant edits.
    // For Slice 3 ship, we surface this clearly.
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

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        className="!w-full !max-w-2xl !rounded-none"
        style={{ maxHeight: "100vh" }}
      >
        <DrawerPrimitive.Title className="sr-only">
          Translate item: {item.name}
        </DrawerPrimitive.Title>

        <header className="flex items-center gap-2 border-b px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">Translate item</span>
            <h2 className="truncate text-base font-semibold">{item.name}</h2>
          </div>
        </header>

        <ScrollArea className="h-full min-h-0 flex-1">
          <div className="flex flex-col gap-6 p-4 md:p-6">
            {/* Source (read-only) */}
            <section className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="h-5">
                  {defaultLocale?.display_name ?? "Source"}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  default · read-only
                </span>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Name</Label>
                <p className="mt-0.5 text-sm font-medium">{item.name}</p>
              </div>
              {item.description && (
                <div>
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">
                    {item.description}
                  </p>
                </div>
              )}
              {item.image_alt && (
                <div>
                  <Label className="text-xs text-muted-foreground">Image alt</Label>
                  <p className="mt-0.5 text-sm">{item.image_alt}</p>
                </div>
              )}
            </section>

            {/* One block per target locale */}
            {targetLocales.map((locale) => {
              const form = forms[locale.locale] ?? initialFormState(undefined);
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
                  className="flex flex-col gap-3 rounded-md border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="h-5">
                        {locale.display_name}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {locale.locale}
                      </span>
                      {serverRow?.is_ai_translated && (
                        <Badge variant="secondary" className="h-5 gap-0.5 text-[10px]">
                          <Bot className="size-3" aria-hidden="true" />
                          AI — review
                        </Badge>
                      )}
                      {stale && (
                        <Badge variant="outline" className="h-5 gap-0.5 text-[10px]">
                          <AlertCircle className="size-3" aria-hidden="true" />
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

                  <div
                    dir={locale.text_direction}
                    className="flex flex-col gap-3"
                  >
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`name-${locale.locale}`} className="text-xs">
                        Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id={`name-${locale.locale}`}
                        value={form.name}
                        onChange={(e) =>
                          updateField(locale.locale, "name", e.target.value)
                        }
                        placeholder={`${item.name} (${locale.display_name})`}
                        disabled={!serverRow && !form.dirty && form.name === ""}
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
                          rows={4}
                          placeholder="Translate the description"
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
                        />
                      </div>
                    )}
                  </div>

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

            <Separator />
            <p className="text-center text-[11px] text-muted-foreground">
              Manual edits override AI translations. AI re-translation will skip
              human-edited rows unless you explicitly retranslate.
            </p>
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
