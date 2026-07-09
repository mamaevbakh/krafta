"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";

import {
  FieldDescription,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/locales/dashboard/context";
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
  const t = useT();
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
        setStatus(result.error ?? t("settings.assistant.update_error"));
        return;
      }
      setStatus(
        next
          ? t("settings.assistant.enabled_toast")
          : t("settings.assistant.disabled_toast"),
      );
    });
  }, [enabled, catalogId, catalogSlug, t]);

  return (
    <FieldSet>
      <FieldLegend className="flex items-center gap-2">
        <Sparkles className="size-4" aria-hidden />
        {t("settings.assistant.legend")}
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("settings.assistant.beta")}
        </span>
      </FieldLegend>
      <FieldDescription>
        {t("settings.assistant.description")}
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
          <div className="text-sm font-medium">
            {t("settings.assistant.enable_label")}
          </div>
          <div
            className={cn(
              "text-xs",
              enabled ? "text-background/70" : "text-muted-foreground",
            )}
          >
            {t("settings.assistant.enable_hint")}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em]">
          {isPending ? <Spinner className="size-4" /> : null}
          {enabled ? t("settings.assistant.on") : t("settings.assistant.off")}
        </div>
      </button>

      {status ? (
        <p className="mt-2 text-sm text-muted-foreground">{status}</p>
      ) : null}
    </FieldSet>
  );
}
