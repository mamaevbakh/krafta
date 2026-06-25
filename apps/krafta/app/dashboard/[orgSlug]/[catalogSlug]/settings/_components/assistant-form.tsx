"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";

import {
  FieldDescription,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { updateAssistantSettings } from "./actions";

/**
 * Settings → Catalog toggle for the storefront AI shopping assistant. When on,
 * tapping "search" on the published storefront opens a conversational assistant
 * (instead of the plain search dialog) that helps shoppers find items and get
 * to checkout. Auto-saves on toggle.
 */
export function AssistantForm({
  catalogId,
  catalogSlug,
  initialEnabled,
}: {
  catalogId: string;
  catalogSlug: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [status, setStatus] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const toggle = React.useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    setStatus(null);
    startTransition(async () => {
      const result = await updateAssistantSettings({
        catalogId,
        catalogSlug,
        enabled: next,
      });
      if (!result.ok) {
        setEnabled(!next); // revert optimistic toggle
        setStatus(result.error ?? "Unable to update the assistant setting.");
        return;
      }
      setStatus(next ? "Assistant enabled." : "Assistant disabled.");
    });
  }, [enabled, catalogId, catalogSlug]);

  return (
    <FieldSet>
      <FieldLegend className="flex items-center gap-2">
        <Sparkles className="size-4" aria-hidden />
        AI shopping assistant
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Beta
        </span>
      </FieldLegend>
      <FieldDescription>
        When on, the storefront search opens a conversational assistant that
        helps shoppers find items in any language and add them to the cart.
        When off, search stays the classic instant results list.
      </FieldDescription>

      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={enabled}
        className={cn(
          "mt-4 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition",
          enabled
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-background hover:border-foreground/30",
        )}
      >
        <div>
          <div className="text-sm font-medium">Enable assistant</div>
          <div
            className={cn(
              "text-xs",
              enabled ? "text-background/70" : "text-muted-foreground",
            )}
          >
            Conversational search for this storefront.
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em]">
          {isPending ? <Spinner className="size-4" /> : null}
          {enabled ? "On" : "Off"}
        </div>
      </button>

      {status ? (
        <p className="mt-2 text-sm text-muted-foreground">{status}</p>
      ) : null}
    </FieldSet>
  );
}
