"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Link2, QrCode, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type FirstOrderCardProps = {
  storefrontUrl: string;
  published: boolean;
  qrHref: string;
  mainQrSvg: string | null;
  telegramUrl: string | null;
};

/**
 * The brand-new merchant's home: 0 lifetime orders means the page's job is to
 * DISTRIBUTE, not operate. This owns the share channels only (link / QR /
 * Telegram) — setup progress stays with the floating checklist. It self-
 * retires the moment order #1 lands (the panel swaps to the operational
 * layout on the realtime refresh).
 */
export function FirstOrderCard({
  storefrontUrl,
  published,
  qrHref,
  mainQrSvg,
  telegramUrl,
}: FirstOrderCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium">
          Get your first order
        </CardTitle>
        <CardDescription>
          Share your shop — orders will show up right here.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {!published ? (
          <p className="border-t px-6 py-4 text-sm text-muted-foreground">
            Publish your shop to get a shareable link and QR code.
          </p>
        ) : (
          <ul className="divide-y border-t">
            <li className="flex items-center gap-3 px-6 py-4">
              <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Shop link</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {storefrontUrl}
                </p>
              </div>
              <CopyButton value={storefrontUrl} />
            </li>

            <li className="flex items-center gap-3 px-6 py-4">
              <QrCode className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">QR code for tables</p>
                <p className="text-xs text-muted-foreground">
                  Print it, put it on the counter.
                </p>
              </div>
              {mainQrSvg ? (
                <Link
                  href={qrHref}
                  className="size-14 shrink-0 overflow-hidden rounded-md border bg-white p-1"
                  aria-label="Open QR codes"
                  dangerouslySetInnerHTML={{ __html: mainQrSvg }}
                />
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href={qrHref}>Open</Link>
                </Button>
              )}
            </li>

            {telegramUrl ? (
              <li className="flex items-center gap-3 px-6 py-4">
                <Send className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Telegram Mini App</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {telegramUrl}
                  </p>
                </div>
                <CopyButton value={telegramUrl} />
              </li>
            ) : null}
          </ul>
        )}
        <p className="px-6 py-4 text-sm text-muted-foreground">
          Your orders will appear here.
        </p>
      </CardContent>
    </Card>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="shrink-0"
      aria-label={copied ? "Copied" : "Copy"}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
    </Button>
  );
}
