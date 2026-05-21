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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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
  stale: number;
  humanEdited: number;
  // Total that would enqueue WITHOUT force
  enqueueable: number;
};

function computeCounts(items: ItemRow[], targetLocale: string): Counts {
  let missing = 0;
  let stale = 0;
  let humanEdited = 0;
  for (const item of items) {
    const t = item.item_translations.find((tr) => tr.locale === targetLocale);
    if (!t) {
      missing += 1;
      continue;
    }
    const isHumanEdited = !t.is_ai_translated && t.last_edited_by !== null;
    const isStale =
      item.current_source_hash !== null &&
      t.source_hash !== null &&
      item.current_source_hash !== t.source_hash;
    if (isHumanEdited) humanEdited += 1;
    if (isStale && !isHumanEdited) stale += 1;
  }
  return {
    missing,
    stale,
    humanEdited,
    enqueueable: missing + stale,
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
  const [open, setOpen] = React.useState(false);
  const [force, setForce] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const counts = React.useMemo(
    () => computeCounts(items, targetLocale.locale),
    [items, targetLocale.locale],
  );

  const requested = force ? items.length : counts.enqueueable;

  const handleConfirm = async () => {
    setSubmitting(true);
    // Collect entityIds. With force, send all items; without, send only the
    // missing + stale ones.
    const entityIds = items
      .filter((item) => {
        const t = item.item_translations.find(
          (tr) => tr.locale === targetLocale.locale,
        );
        if (force) return true;
        if (!t) return true; // missing
        const isHumanEdited = !t.is_ai_translated && t.last_edited_by !== null;
        if (isHumanEdited) return false;
        const isStale =
          item.current_source_hash !== null &&
          t.source_hash !== null &&
          item.current_source_hash !== t.source_hash;
        return isStale;
      })
      .map((item) => item.id);

    if (entityIds.length === 0) {
      setSubmitting(false);
      setOpen(false);
      toast.info(
        force
          ? "Nothing to translate."
          : "Everything is up to date. Use Retranslate inside a row to override.",
      );
      return;
    }

    const result = await enqueueTranslationJob({
      catalogId,
      targetLocale: targetLocale.locale,
      entityKind: "item",
      entityIds,
      force,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setOpen(false);
    setForce(false);
    const enqueued = result.enqueued ?? 0;
    const skipped = result.skippedHumanEdited ?? 0;
    toast.success(
      enqueued === 0
        ? skipped > 0
          ? `Nothing enqueued — ${skipped} human-edited row${skipped === 1 ? "" : "s"} preserved.`
          : "Nothing to translate."
        : `Queued ${enqueued} translation${enqueued === 1 ? "" : "s"}.${skipped > 0 ? ` Skipped ${skipped} human-edited row${skipped === 1 ? "" : "s"}.` : ""}`,
    );
    onEnqueued();
  };

  const disabled = counts.enqueueable === 0 && !force;

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
            Translating into {targetLocale.display_name}…
          </>
        ) : (
          <>
            <Sparkles
              className={variant === "primary" ? "size-4" : "size-3.5"}
              aria-hidden="true"
            />
            {labelMode === "compact"
              ? "Translate all missing with AI"
              : `Translate missing → ${targetLocale.display_name}`}
          </>
        )}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Translate to {targetLocale.display_name}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2 text-sm">
                <div>
                  This will enqueue{" "}
                  <strong className="text-foreground">{requested}</strong>{" "}
                  translation{requested === 1 ? "" : "s"} (
                  <span className="text-foreground">{counts.missing}</span> missing
                  {" "}+{" "}
                  <span className="text-foreground">{counts.stale}</span> stale
                  {counts.humanEdited > 0 && !force && (
                    <>
                      ;{" "}
                      <span className="text-foreground">
                        {counts.humanEdited} human-edited
                      </span>{" "}
                      row{counts.humanEdited === 1 ? "" : "s"} skipped
                    </>
                  )}
                  ).
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {counts.humanEdited > 0 && (
            <div className="flex items-start justify-between gap-3 rounded-md border bg-card p-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Label htmlFor="force-toggle" className="text-sm font-medium">
                  Also re-translate human-edited rows
                </Label>
                <span className="text-xs text-muted-foreground">
                  By default we skip rows you&apos;ve manually edited. Turn this
                  on to overwrite them with fresh AI translations.
                </span>
              </div>
              <Switch
                id="force-toggle"
                checked={force}
                onCheckedChange={setForce}
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
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
