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
  const [enabled, setEnabled] = React.useState(initial.enabled);
  const [status, setStatus] = React.useState<Status>(null);
  const [copied, setCopied] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  if (!venueId) {
    return (
      <FieldSet>
        <FieldLegend>Telegram Mini App</FieldLegend>
        <div className="mt-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Venue row not found for this catalog. The Mini App needs a venue.
        </div>
      </FieldSet>
    );
  }

  if (!initial.deepLink || !initial.botUsername) {
    return (
      <FieldSet>
        <FieldLegend>Telegram Mini App</FieldLegend>
        <FieldDescription>
          Let customers order from your shop inside Telegram — no app install.
        </FieldDescription>
        <div className="mt-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          The Krafta bot isn’t configured yet on our side. Please contact
          support to turn on the Mini App.
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
      setStatus({ kind: "err", msg: "Не удалось скопировать ссылку." });
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Закажите у нас в Telegram",
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
      <FieldLegend>Telegram Mini App</FieldLegend>
      <FieldDescription>
        Let customers order from your shop inside Telegram — no app install. We
        host it on the shared <span className="font-mono">@{initial.botUsername}</span>{" "}
        bot, so there’s nothing for you to set up.
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
            Enable Mini App storefront
          </FieldLabel>
          {pending ? <Spinner className="size-4 text-muted-foreground" /> : null}
        </Field>

        {enabled ? (
          <>
            <Field>
              <FieldLabel>Your Mini App link</FieldLabel>
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
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <FieldDescription>
                Share this link anywhere — tapping it opens your shop right
                inside Telegram.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>QR code</FieldLabel>
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                {initial.qrSvg ? (
                  <div
                    aria-label="Mini App QR code"
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
                        Open in Telegram
                      </a>
                    </Button>
                    <Button type="button" variant="outline" onClick={handleShare}>
                      <Share2 className="size-4" />
                      Share
                    </Button>
                  </div>
                  <FieldDescription>
                    Print it for tables or the counter. Customers scan to order.
                  </FieldDescription>
                </div>
              </div>
            </Field>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Turn it on to get a shareable link and a QR code for your tables.
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
