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
import type { EntityKind } from "@/lib/translation/schemas";

import type { CatalogLocale } from "./languages-sidebar";

/**
 * Master "do it all" CTA — translates every missing row across every
 * target language AND every entity kind with one click.
 *
 * Lives in the panel header so it's reachable from any tab. Built on
 * BorderBeamButton so the glow telegraphs "AI" without needing a separate
 * label. The button is hidden entirely when there's nothing to enqueue —
 * a quiet header reads "all caught up" without needing a banner.
 *
 * KRA-97: extended to fan out across all five entity kinds (items,
 * categories, variations, modifiers, modifier lists). Previously the
 * button hardcoded `entityKind: "item"` and silently left the other four
 * kinds untranslated, so a "100% translated" claim was misleading.
 * The enqueue loop now dispatches one job per (locale × kind) pair.
 */

/**
 * One entity-kind payload the button can fan out over.
 *
 * `rows` is anything with an id + a translations array. We don't take a
 * narrower type because each tab carries a slightly different EntityRow
 * shape (Items has more fields than Variations etc.) and there's no
 * shared interface for them across the workbench.
 */
export type TranslateEverythingEntityPayload = {
  kind: EntityKind;
  /** Singular noun used in confirmation dialog ("item", "category", …). */
  singularLabel: string;
  /** Plural noun used in confirmation dialog ("items", "categories", …). */
  pluralLabel: string;
  rows: ReadonlyArray<{
    id: string;
    translations: ReadonlyArray<{ locale: string }>;
  }>;
};

export type TranslateEverythingButtonProps = {
  catalogId: string;
  targetLocales: CatalogLocale[];
  /**
   * All entity kinds this catalog has. Each entry contributes its own
   * "missing translation rows" to the master count + enqueue fan-out.
   * Empty arrays are fine — they contribute zero.
   */
  entities: TranslateEverythingEntityPayload[];
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

/**
 * Per (locale × kind) breakdown the dialog and the enqueue loop both
 * consume. Built once via useMemo and reused so the displayed count
 * matches the enqueued count byte-for-byte.
 */
type KindBreakdown = {
  kind: EntityKind;
  singularLabel: string;
  pluralLabel: string;
  entityIds: string[];
};

type LocaleBreakdown = {
  locale: CatalogLocale;
  perKind: KindBreakdown[];
  totalForLocale: number;
};

export function TranslateEverythingButton({
  catalogId,
  targetLocales,
  entities,
  onEnqueued,
  className,
  isAiBusy = false,
}: TranslateEverythingButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Compute the work that will be enqueued per (locale, kind). Only
  // truly-missing rows get queued — anything else counts as already
  // translated. Staleness is no longer surfaced as a status; the
  // future auto-retranslate-on-source-change feature handles that.
  const perLanguage = React.useMemo<LocaleBreakdown[]>(() => {
    const out: LocaleBreakdown[] = [];
    for (const locale of targetLocales) {
      const perKind: KindBreakdown[] = [];
      let totalForLocale = 0;
      for (const entity of entities) {
        const entityIds: string[] = [];
        for (const row of entity.rows) {
          if (!row.translations.find((tr) => tr.locale === locale.locale)) {
            entityIds.push(row.id);
          }
        }
        if (entityIds.length > 0) {
          perKind.push({
            kind: entity.kind,
            singularLabel: entity.singularLabel,
            pluralLabel: entity.pluralLabel,
            entityIds,
          });
          totalForLocale += entityIds.length;
        }
      }
      if (totalForLocale > 0) {
        out.push({ locale, perKind, totalForLocale });
      }
    }
    return out;
  }, [targetLocales, entities]);

  const grandTotal = React.useMemo(
    () => perLanguage.reduce((acc, p) => acc + p.totalForLocale, 0),
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
    // Fan out: per locale, per kind. Sequential within a locale so a
    // single failure short-circuits the rest of the batch (and the
    // partial enqueue is still useful — what landed is queued, what
    // didn't shows in the toast).
    outer: for (const { locale, perKind } of perLanguage) {
      for (const { kind, entityIds } of perKind) {
        const result = await enqueueTranslationJob({
          catalogId,
          targetLocale: locale.locale,
          entityKind: kind,
          entityIds,
          force: false,
        });
        if (!result.ok) {
          firstError = result.error;
          break outer;
        }
        totalEnqueued += result.enqueued ?? 0;
      }
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
        : `Queued ${totalEnqueued} translations across ${perLanguage.length} ${perLanguage.length === 1 ? "language" : "languages"}.`,
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
                  {perLanguage.map(({ locale, perKind, totalForLocale }) => (
                    <li key={locale.locale}>
                      <span className="font-medium text-foreground">
                        {locale.display_name}
                      </span>{" "}
                      — {totalForLocale} total
                      {/* Per-kind breakdown nested under the locale —
                          gives the merchant a sense of where the work
                          lives ("3 items, 2 categories, 5 variations"). */}
                      <span className="ml-1 text-muted-foreground/80">
                        (
                        {perKind
                          .map(
                            (k) =>
                              `${k.entityIds.length} ${k.entityIds.length === 1 ? k.singularLabel : k.pluralLabel}`,
                          )
                          .join(", ")}
                        )
                      </span>
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
