"use client";

import { useEffect, useState } from "react";

import { PayLink } from "@/components/dashboard/pay-link.client";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMinorAmount } from "@/lib/format";
import { formatPayDate } from "@/lib/format-date";
import { usePayLocale, useT } from "@/lib/locales/context";
import { PAYMENT_STATUS_META, type PaymentListRow } from "@/lib/payments-list";


/**
 * The payments table.
 *
 * DESIGN.md §206 makes 375px the primary viewport and desktop the progressive
 * enhancement, and this page in particular is one a merchant checks from a phone
 * between other things — Galaktika has no engineer and no back office. So the
 * narrow layout is not a degraded desktop table: it carries the three facts that
 * answer "did they pay" (what it was for, how much, what happened) and the rest
 * appears as the viewport earns it.
 */
export function PaymentsListClient({
  orgId,
  environment,
}: {
  orgId: string;
  environment: "test" | "live";
}) {
  const t = useT();
  const locale = usePayLocale();
  const [rows, setRows] = useState<PaymentListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      try {
        const res = await fetch(
          `/api/dashboard/payments?orgId=${encodeURIComponent(orgId)}&environment=${environment}`,
          { cache: "no-store" },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
        if (ignore) return;
        setRows(json?.payments ?? []);
        setError(null);
      } catch (e) {
        if (ignore) return;
        setRows([]);
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    void run();
    return () => {
      ignore = true;
    };
  }, [orgId, environment]);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (rows === null) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        {t("payments.list.loading")}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        {t("payments.list.empty")}
      </div>
    );
  }

  return (
    <>
      {/* Narrow: a stacked list, not a squeezed table.
          Three columns of this content genuinely do not fit 375px — rendered at
          that width, the amount clipped mid-number and the status badge fell off
          the right edge entirely, which loses the one fact the page exists to
          report. So the phone layout puts the amount and the status on their own
          line under the description, where both are always fully visible. */}
      <ul className="divide-y rounded-lg border sm:hidden">
        {rows.map((row) => {
          const meta = PAYMENT_STATUS_META[row.status];
          return (
            <li key={row.id} className="space-y-2 p-4">
              <div>
                <span className="block font-medium">
                  {row.description ?? t("payments.noDescription")}
                </span>
                {row.orderId ? (
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {row.orderId}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono tabular-nums">
                  {formatMinorAmount(row.amountMinor, row.currency)}
                </span>
                <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
              </div>

              <div className="text-xs text-muted-foreground">
                {row.paidAt
                  ? `${t("payments.col.paid")} ${formatPayDate(row.paidAt, locale, "short")}`
                  : `${t("payments.col.created")} ${formatPayDate(row.createdAt, locale, "short")}`}
              </div>

              {row.payUrl ? (
                <div className="space-y-1">
                  {/* A declined payment and an unpaid one render an identical
                      bare URL otherwise, so the merchant has no way to know the
                      same link still works after a decline — the one fact that
                      turns a lost sale into a recovered one. */}
                  <span className="block text-xs text-muted-foreground">
                    {row.payLinkIntent === "retry"
                      ? t("payments.link.retry")
                      : t("payments.link.send")}
                  </span>
                  <PayLink url={row.payUrl} className="bg-background" />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-hidden rounded-lg border sm:block">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="px-4 text-xs text-muted-foreground">
              {t("payments.col.description")}
            </TableHead>
            <TableHead className="text-right text-xs text-muted-foreground">
              {t("payments.col.amount")}
            </TableHead>
            <TableHead className="text-xs text-muted-foreground">
              {t("payments.col.status")}
            </TableHead>
            {/* Everything past here is progressive enhancement. */}
            <TableHead className="text-xs text-muted-foreground">
              {t("payments.col.created")}
            </TableHead>
            <TableHead className="hidden text-xs text-muted-foreground md:table-cell">
              {t("payments.col.paid")}
            </TableHead>
            {/* Not progressive enhancement, unlike the two above: this is the
                only control on the row. It used to be `hidden lg:table-cell`
                while the table itself starts at `sm:`, so between 640px and
                1023px — a tablet, or a half-width laptop window — a merchant
                with a declined payment was shown no way to act on it at all.
                The column is now unconditional and its CONTENTS collapse
                instead, so a future breakpoint edit cannot reopen the gap. */}
            <TableHead className="px-4 text-xs text-muted-foreground">
              {t("payments.col.link")}
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => {
            const meta = PAYMENT_STATUS_META[row.status];
            return (
              <TableRow key={row.id}>
                <TableCell className="px-4">
                  <span className="block max-w-[15rem] truncate font-medium">
                    {row.description ?? t("payments.noDescription")}
                  </span>
                  {/* The merchant's own reference, when their backend sent one.
                      It is what they search for, so it sits under the name
                      rather than in a column that disappears on a phone. */}
                  {row.orderId ? (
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {row.orderId}
                    </span>
                  ) : null}
                </TableCell>

                <TableCell className="text-right font-mono tabular-nums">
                  {formatMinorAmount(row.amountMinor, row.currency)}
                </TableCell>

                <TableCell>
                  <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
                </TableCell>

                <TableCell className="text-sm text-muted-foreground">
                  {formatPayDate(row.createdAt, locale, "short")}
                </TableCell>

                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {formatPayDate(row.paidAt, locale, "short")}
                </TableCell>

                <TableCell className="w-auto px-4 lg:w-72 lg:max-w-72">
                  {/* Only unpaid payments carry a link — see shouldOfferPayLink.
                      Re-sending one for a settled payment is how a customer gets
                      charged twice by a merchant trying to be helpful. */}
                  {row.payUrl ? (
                    <div className="space-y-1">
                      <PayLink
                        url={row.payUrl}
                        className="bg-background"
                        collapseUrlBelowLg
                      />
                      {row.payLinkIntent === "retry" ? (
                        <span className="hidden text-xs text-muted-foreground lg:block">
                          {t("payments.link.retry")}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>
    </>
  );
}
