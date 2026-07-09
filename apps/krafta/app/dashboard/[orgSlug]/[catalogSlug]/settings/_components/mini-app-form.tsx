"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { useT } from "@/lib/locales/dashboard/context";
import { cn } from "@/lib/utils";

import { setTmaEnabled } from "./tma-actions";

export type MiniAppInitial = {
  enabled: boolean;
  /** `https://t.me/<bot>?startapp=<catalog-slug>` — null when the platform
   *  bot username isn't configured server-side. */
  deepLink: string | null;
  botUsername: string | null;
  /** Pre-rendered branded QR SVG for the deep link (null when no deepLink). */
  qrSvg: string | null;
};

type Status = { kind: "ok" | "err"; msg: string } | null;

export function MiniAppForm({
  venueId,
  initial,
}: {
  venueId: string | null;
  initial: MiniAppInitial;
}) {
  const t = useT();
  const [enabled, setEnabled] = React.useState(initial.enabled);
  const [status, setStatus] = React.useState<Status>(null);
  const [copied, setCopied] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  if (!venueId) {
    return (
      <FieldSet>
        <FieldLegend>{t("settings.miniapp.legend")}</FieldLegend>
        <div className="mt-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {t("settings.miniapp.no_venue")}
        </div>
      </FieldSet>
    );
  }

  if (!initial.deepLink || !initial.botUsername) {
    return (
      <FieldSet>
        <FieldLegend>{t("settings.miniapp.legend")}</FieldLegend>
        <FieldDescription>
          {t("settings.miniapp.description")}
        </FieldDescription>
        <div className="mt-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {t("settings.miniapp.not_configured")}
        </div>
      </FieldSet>
    );
  }

  const deepLink = initial.deepLink;

  const handleToggle = (next: boolean) =>
    startTransition(async () => {
      setStatus(null);
      setEnabled(next);
      const res = await setTmaEnabled({ venueId, enabled: next });
      if (!res.ok) {
        setEnabled(!next);
        setStatus({ kind: "err", msg: res.error });
      }
    });

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(deepLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setStatus({ kind: "err", msg: t("settings.miniapp.copy_error") });
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: t("settings.miniapp.share_title"),
          url: deepLink,
        });
        return;
      } catch {
        /* user dismissed the share sheet — not an error */
        return;
      }
    }
    await handleCopy();
  };

  return (
    <FieldSet>
      <FieldLegend>{t("settings.miniapp.legend")}</FieldLegend>
      <FieldDescription>
        {t("settings.miniapp.description")} {t("settings.miniapp.hosted_pre")}{" "}
        <span className="font-mono">@{initial.botUsername}</span>
        {t("settings.miniapp.hosted_post")}
      </FieldDescription>

      <FieldGroup className="mt-6 gap-6">
        <Field orientation="horizontal">
          <Switch
            id="tma-enabled"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={pending}
          />
          <FieldLabel htmlFor="tma-enabled" className="cursor-pointer">
            {t("settings.miniapp.enable_label")}
          </FieldLabel>
          {pending ? <Spinner className="size-4 text-muted-foreground" /> : null}
        </Field>

        {enabled ? (
          <>
            <Field>
              <FieldLabel>{t("settings.miniapp.link_label")}</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                  {deepLink}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  {copied ? t("common.copied") : t("common.copy")}
                </Button>
              </div>
              <FieldDescription>
                {t("settings.miniapp.link_hint")}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t("settings.miniapp.qr_label")}</FieldLabel>
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                {initial.qrSvg ? (
                  <div
                    aria-label={t("settings.miniapp.qr_aria")}
                    className="size-40 shrink-0 rounded-xl border bg-white p-2 [&>svg]:size-full"
                    dangerouslySetInnerHTML={{ __html: initial.qrSvg }}
                  />
                ) : null}
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" asChild>
                      <a
                        href={deepLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="size-4" />
                        {t("settings.miniapp.open_in_telegram")}
                      </a>
                    </Button>
                    <Button type="button" variant="outline" onClick={handleShare}>
                      <Share2 className="size-4" />
                      {t("settings.miniapp.share")}
                    </Button>
                  </div>
                  <FieldDescription>
                    {t("settings.miniapp.qr_hint")}
                  </FieldDescription>
                </div>
              </div>
            </Field>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("settings.miniapp.disabled_hint")}
          </p>
        )}
      </FieldGroup>

      {status ? (
        <p
          className={cn(
            "mt-4 text-sm",
            status.kind === "err"
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {status.msg}
        </p>
      ) : null}
    </FieldSet>
  );
}
