"use client";

import * as React from "react";
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
import { useT } from "@/lib/locales/dashboard/context";

import { enqueueTranslationJob } from "@/lib/translation/actions";
import type { CatalogLocale } from "./languages-sidebar";
import type { ItemRow } from "./items-tab";

/**
 * Bulk "Translate all to {locale}" button + confirmation dialog.
 *
 * Default scope: items where translation is missing OR stale. Human-edited
 * rows are SKIPPED by default — protects merchant work. A "Force" toggle in
 * the dialog includes them (with a second-level warning).
 *
 * Confirmation shows the math:
 *   "This will enqueue 87 translations (12 missing + 75 stale; 6 human-edited
 *    rows skipped). Daily quota remaining after: 413/500. Proceed?"
 *
 * After enqueue → toast + onEnqueued() to refresh the parent. Worker will
 * pick up the jobs within ~60 seconds via cron (or the merchant can wait).
 */

export type TranslateAllButtonProps = {
  catalogId: string;
  targetLocale: CatalogLocale;
  items: ItemRow[];
  onEnqueued: () => void;
  /**
   * "with-locale" (default) — for surfaces with multiple bulk buttons in a
   * row (Items toolbar). Shows the locale name on the button so the merchant
   * can tell them apart at a glance.
   *
   * "compact" — for surfaces where the locale is already visible elsewhere
   * (Overview language cards). Drops the locale name; reads as just
   * "Translate all missing with AI."
   */
  labelMode?: "with-locale" | "compact";
  /** Optional visual variant — outline by default, "primary" reads stronger. */
  variant?: "outline" | "primary";
  /**
   * True when this target locale has an in-flight translation_job
   * (realtime). Disables the button and flips the label to
   * "Translating into X…" so the merchant doesn't stack a second
   * batch on top of the running one. The DB UNIQUE constraint
   * dedupes anyway but a disabled button reads as "wait" — silent
   * rejection reads as "broken."
   */
  isAiBusy?: boolean;
};

type Counts = {
  missing: number;
  /** Total that would enqueue WITHOUT force. Now equals `missing`
   *  exactly — staleness is no longer auto-retranslated as a UI
   *  side effect. The `force` toggle remains for the rare case
   *  where a merchant wants to retranslate every row regardless. */
  enqueueable: number;
};

function computeCounts(items: ItemRow[], targetLocale: string): Counts {
  let missing = 0;
  for (const item of items) {
    const t = item.item_translations.find((tr) => tr.locale === targetLocale);
    if (!t) missing += 1;
  }
  return {
    missing,
    enqueueable: missing,
  };
}

export function TranslateAllButton({
  catalogId,
  targetLocale,
  items,
  onEnqueued,
  labelMode = "with-locale",
  variant = "outline",
  isAiBusy = false,
}: TranslateAllButtonProps) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const counts = React.useMemo(
    () => computeCounts(items, targetLocale.locale),
    [items, targetLocale.locale],
  );

  const requested = counts.enqueueable;

  const handleConfirm = async () => {
    setSubmitting(true);
    // Enqueue only items where no translation row exists for this
    // locale. Stale + human-edited rows are no longer auto-handled —
    // see translate-everything-button.tsx for the rationale.
    const entityIds = items
      .filter((item) => {
        const t = item.item_translations.find(
          (tr) => tr.locale === targetLocale.locale,
        );
        return !t;
      })
      .map((item) => item.id);

    if (entityIds.length === 0) {
      setSubmitting(false);
      setOpen(false);
      toast.info(t("translations.nothing_to_translate"));
      return;
    }

    const result = await enqueueTranslationJob({
      catalogId,
      targetLocale: targetLocale.locale,
      entityKind: "item",
      entityIds,
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
        ? t("translations.nothing_to_translate")
        : t("translations.queued_n", { count: enqueued }),
    );
    onEnqueued();
  };

  const disabled = counts.enqueueable === 0;

  return (
    <>
      <Button
        variant={variant === "primary" ? "default" : "outline"}
        size="sm"
        onClick={() => setOpen(true)}
        // Disabled when there's nothing to translate OR when a job for
        // this locale is already in-flight. The realtime hook tracks
        // queued/running translation_jobs per catalog; the parent maps
        // those into a per-locale busy flag.
        disabled={items.length === 0 || isAiBusy}
        className={
          variant === "primary"
            ? "gap-1.5"
            : "h-7 gap-1.5 text-xs font-normal"
        }
      >
        {isAiBusy ? (
          <>
            <Loader2
              className={
                variant === "primary"
                  ? "size-4 animate-spin"
                  : "size-3.5 animate-spin"
              }
              aria-hidden="true"
            />
            {t("translations.translating_into", {
              name: targetLocale.display_name,
            })}
          </>
        ) : (
          <>
            <Sparkles
              className={variant === "primary" ? "size-4" : "size-3.5"}
              aria-hidden="true"
            />
            {labelMode === "compact"
              ? t("translations.translate_all_missing")
              : t("translations.translate_missing_to", {
                  name: targetLocale.display_name,
                })}
          </>
        )}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("translations.translate_to_title", {
                name: targetLocale.display_name,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2 text-sm">
                <div>
                  {t("translations.translate_to_desc", {
                    count: requested,
                    name: targetLocale.display_name,
                  })}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
              disabled={submitting || disabled}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t("translations.queuing")}
                </>
              ) : (
                t("translations.translate")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
