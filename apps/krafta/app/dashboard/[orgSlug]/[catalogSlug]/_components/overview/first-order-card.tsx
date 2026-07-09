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
import { useT } from "@/lib/locales/dashboard/context";

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
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium">
          {t("overview.first_order_title")}
        </CardTitle>
        <CardDescription>{t("overview.first_order_subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {!published ? (
          <p className="border-t px-6 py-4 text-sm text-muted-foreground">
            {t("overview.publish_to_share")}
          </p>
        ) : (
          <ul className="divide-y border-t">
            <li className="flex items-center gap-3 px-6 py-4">
              <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t("overview.shop_link")}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {storefrontUrl}
                </p>
              </div>
              <CopyButton value={storefrontUrl} />
            </li>

            <li className="flex items-center gap-3 px-6 py-4">
              <QrCode className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {t("overview.qr_for_tables")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("overview.qr_hint")}
                </p>
              </div>
              {mainQrSvg ? (
                <Link
                  href={qrHref}
                  className="size-14 shrink-0 overflow-hidden rounded-md border bg-white p-1"
                  aria-label={t("overview.open_qr_codes")}
                  dangerouslySetInnerHTML={{ __html: mainQrSvg }}
                />
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href={qrHref}>{t("overview.open")}</Link>
                </Button>
              )}
            </li>

            {telegramUrl ? (
              <li className="flex items-center gap-3 px-6 py-4">
                <Send className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {t("overview.telegram_mini_app")}
                  </p>
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
          {t("overview.orders_appear_here")}
        </p>
      </CardContent>
    </Card>
  );
}

function CopyButton({ value }: { value: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="shrink-0"
      aria-label={copied ? t("common.copied") : t("common.copy")}
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
