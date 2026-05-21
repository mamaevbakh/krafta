"use client";

import * as React from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { BorderBeamButton } from "@/components/ui/border-beam-button";
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

import { enqueueTranslationJob } from "@/lib/translation/actions";

import type { CatalogLocale } from "./languages-sidebar";
import type { ItemRow } from "./items-tab";

/**
 * Master "do it all" CTA — translates every missing or stale row across
 * every target language with one click.
 *
 * Lives in the panel header so it's reachable from any tab. Built on
 * BorderBeamButton so the glow telegraphs "AI" without needing a separate
 * label. The button is hidden entirely when there's nothing to enqueue —
 * a quiet header reads "all caught up" without needing a banner.
 *
 * The enqueue loop mirrors the per-language TranslateAllButton's
 * "missing + stale, skip human-edited" logic, fanning out one job per
 * target language so the worker can process each independently.
 */

export type TranslateEverythingButtonProps = {
  catalogId: string;
  targetLocales: CatalogLocale[];
  items: ItemRow[];
  onEnqueued: () => void;
  /** Optional className passed through to the BorderBeamButton's Button. */
  className?: string;
};

export function TranslateEverythingButton({
  catalogId,
  targetLocales,
  items,
  onEnqueued,
  className,
}: TranslateEverythingButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Compute the work that will be enqueued per language. Mirrors
  // TranslateAllButton's classifier so the dialog count matches what the
  // server will actually queue (missing + stale, never human-edited).
  const perLanguage = React.useMemo(() => {
    const out: Array<{ locale: CatalogLocale; entityIds: string[] }> = [];
    for (const locale of targetLocales) {
      const entityIds: string[] = [];
      for (const item of items) {
        const t = item.item_translations.find(
          (tr) => tr.locale === locale.locale,
        );
        if (!t) {
          entityIds.push(item.id);
          continue;
        }
        const isHumanEdited =
          !t.is_ai_translated && t.last_edited_by !== null;
        if (isHumanEdited) continue;
        const isStale =
          item.current_source_hash !== null &&
          t.source_hash !== null &&
          item.current_source_hash !== t.source_hash;
        if (!t.is_ai_translated && !isStale) {
          // Already reviewed and fresh — skip.
          continue;
        }
        if (t.is_ai_translated || isStale) {
          entityIds.push(item.id);
        }
      }
      if (entityIds.length > 0) out.push({ locale, entityIds });
    }
    return out;
  }, [targetLocales, items]);

  const grandTotal = React.useMemo(
    () => perLanguage.reduce((acc, p) => acc + p.entityIds.length, 0),
    [perLanguage],
  );

  if (grandTotal === 0) {
    // Quiet state — nothing to translate. Render nothing rather than a
    // greyed-out button; the header reads cleaner.
    return null;
  }

  const handleConfirm = async () => {
    setSubmitting(true);
    let totalEnqueued = 0;
    let firstError: string | null = null;
    for (const { locale, entityIds } of perLanguage) {
      const result = await enqueueTranslationJob({
        catalogId,
        targetLocale: locale.locale,
        entityKind: "item",
        entityIds,
        force: false,
      });
      if (!result.ok) {
        firstError = result.error;
        break;
      }
      totalEnqueued += result.enqueued ?? 0;
    }
    setSubmitting(false);
    setOpen(false);

    if (firstError) {
      toast.error(firstError);
      return;
    }
    toast.success(
      totalEnqueued === 0
        ? "Nothing new to translate."
        : `Queued ${totalEnqueued} translations across ${perLanguage.length} languages.`,
    );
    onEnqueued();
  };

  return (
    <>
      <BorderBeamButton
        onClick={() => setOpen(true)}
        className={className}
        // sm beam reads as "this is animated / AI is alive here" without
        // shouting. The button stays a normal-weight CTA.
        beamSize="sm"
      >
        <Sparkles className="size-4" aria-hidden="true" />
        Translate everything missing ({grandTotal})
      </BorderBeamButton>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Translate everything missing with AI?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2 text-sm">
                <p>
                  This will queue{" "}
                  <strong className="text-foreground">{grandTotal}</strong>{" "}
                  translation{grandTotal === 1 ? "" : "s"} across{" "}
                  <strong className="text-foreground">
                    {perLanguage.length}
                  </strong>{" "}
                  language{perLanguage.length === 1 ? "" : "s"}:
                </p>
                <ul className="ml-4 list-disc text-xs text-muted-foreground">
                  {perLanguage.map(({ locale, entityIds }) => (
                    <li key={locale.locale}>
                      <span className="font-medium text-foreground">
                        {locale.display_name}
                      </span>{" "}
                      — {entityIds.length} item
                      {entityIds.length === 1 ? "" : "s"}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Rows you&apos;ve manually edited stay untouched. To
                  retranslate a specific row over your edit, use the row&apos;s
                  own AI button.
                </p>
              </div>
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
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Queuing…
                </>
              ) : (
                "Translate everything"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
