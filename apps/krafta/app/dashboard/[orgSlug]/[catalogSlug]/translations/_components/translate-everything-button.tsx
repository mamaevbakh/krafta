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
  /**
   * Set true while AI is processing translations for this catalog
   * (realtime: any translation_job in queued/running state). The
   * button disables and the label flips to "AI translating…" so the
   * merchant can't enqueue a second batch on top of the running one.
   *
   * The DB's UNIQUE (catalog_id, target_locale, entity_kind, entity_id)
   * would reject duplicates anyway, but a disabled button is a far
   * better signal than a silent rejection from the merchant's POV.
   */
  isAiBusy?: boolean;
};

export function TranslateEverythingButton({
  catalogId,
  targetLocales,
  items,
  onEnqueued,
  className,
  isAiBusy = false,
}: TranslateEverythingButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Compute the work that will be enqueued per language. Only truly
  // missing rows get queued — anything else counts as already
  // translated. The previous "missing + stale" model was dropped along
  // with the "Needs review" surface; staleness is no longer a status
  // the merchant sees, and silently enqueuing stale rows would cause
  // the displayed count (matches "items where no row exists") to
  // diverge from what actually gets queued. When auto-retranslate-on-
  // source-change ships as a separate feature, stale rows will be
  // handled there rather than batched into this button.
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
        type="button"
        // outline keeps the button background transparent so the colorful
        // beam reads against the dark surface — same pairing the cult-ui
        // demo uses for its Colorful/Ocean/Sunset/Mono row. variant=default
        // washes the beam out with a solid fill.
        variant="outline"
        // "colorful" cycles a full-spectrum hue around the border. Reads
        // unmistakably as "AI / generative" without leaning on copy to
        // explain itself. Pairs naturally with the Sparkles icon.
        colorVariant="sunset"
        // md keeps a perceptible glow at header sizing; sm felt too
        // subtle for a primary CTA carrying this much weight.
        beamSize="md"
        // Disable while AI is mid-flight to prevent stacking a second
        // batch on top. The header pulse already says exactly what's
        // happening; the button's label flips to a calm spinner so the
        // disabled state reads as "waiting" rather than "broken."
        disabled={isAiBusy}
        // Pause the beam too while idle-but-busy — a glowing disabled
        // button is mixed-signals.
        active={!isAiBusy}
      >
        {isAiBusy ? (
          <>
            <Loader2
              className="size-4 animate-spin"
              aria-hidden="true"
            />
            AI translating…
          </>
        ) : (
          <>
            <Sparkles className="size-4" aria-hidden="true" />
            Translate everything missing ({grandTotal})
          </>
        )}
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
