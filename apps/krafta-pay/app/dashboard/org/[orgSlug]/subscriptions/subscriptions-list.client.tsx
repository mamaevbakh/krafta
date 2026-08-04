"use client";

import { useEffect, useState } from "react";

import { payDateFormatter } from "@/lib/format-date";
import { usePayLocale, useT } from "@/lib/locales/context";
import type { PayMessageKey } from "@/lib/locales/catalog";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { formatMinorAmount } from "@/lib/format";
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

type SubscriptionRow = {
  id: string;
  status: string;
  customer_id: string | null;
  /** Open checkout link for the outstanding invoice, if the customer still owes one. */
  pay_url?: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  plans: {
    name: string;
    code: string;
    amount_minor: number;
    currency: string;
    interval: string | null;
    interval_count: number | null;
  } | null;
  customers: {
    email: string | null;
    phone: string | null;
  } | null;
};



/**
 * `success` and `warning` are the two ratified status tokens (DESIGN.md) and
 * they are soft-bg pills, never saturated fills — state should read as calm.
 * Anything awaiting money from the customer is `warning`; anything finished or
 * inert is muted, so the eye lands only on rows that need action.
 */
const STATUS: Record<
  string,
  { labelKey: PayMessageKey; variant: "success" | "warning" | "secondary" | "outline" }
> = {
  active: { labelKey: "subscriptions.status.active", variant: "success" },
  trialing: { labelKey: "subscriptions.status.trialing", variant: "secondary" },
  past_due: { labelKey: "subscriptions.status.past_due", variant: "warning" },
  incomplete: { labelKey: "subscriptions.status.incomplete", variant: "warning" },
  incomplete_expired: { labelKey: "subscriptions.status.incomplete_expired", variant: "outline" },
  paused: { labelKey: "subscriptions.status.paused", variant: "secondary" },
  canceled: { labelKey: "subscriptions.status.canceled", variant: "outline" },
};

function billingSuffix(plan: SubscriptionRow["plans"]) {
  if (!plan?.interval) return null;
  const n = plan.interval_count ?? 1;
  return n === 1 ? `/ ${plan.interval}` : `/ ${n} ${plan.interval}s`;
}

export function SubscriptionsListClient({
  orgId,
  orgSlug,
}: {
  orgId: string;
  orgSlug: string;
}) {
  const router = useRouter();
  const t = useT();
  const fmtDate = payDateFormatter(usePayLocale());
  const [rows, setRows] = useState<SubscriptionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let ignore = false;
    const run = async () => {
      try {
        const res = await fetch(
          `/api/dashboard/subscriptions?orgId=${encodeURIComponent(orgId)}`,
          { cache: "no-store" },
        );
        const json = (await res.json().catch(() => null)) as
          | { subscriptions?: SubscriptionRow[]; error?: string }
          | null;
        if (!res.ok) {
          throw new Error(json?.error ?? `http_${res.status}`);
        }
        if (ignore) return;
        setRows(json?.subscriptions ?? []);
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
  }, [orgId]);

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
        {t("subscriptions.list.loading")}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        {t("subscriptions.list.empty")}
      </div>
    );
  }

  function open(row: SubscriptionRow) {
    if (!row.customer_id) return;
    router.push(`/dashboard/org/${orgSlug}/customers/${row.customer_id}`);
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="px-4 text-xs text-muted-foreground">{t("subscriptions.col.customer")}</TableHead>
            <TableHead className="text-xs text-muted-foreground">{t("subscriptions.col.status")}</TableHead>
            <TableHead className="text-xs text-muted-foreground">{t("subscriptions.col.plan")}</TableHead>
            <TableHead className="text-right text-xs text-muted-foreground">{t("subscriptions.col.amount")}</TableHead>
            <TableHead className="text-xs text-muted-foreground">{t("subscriptions.col.nextInvoice")}</TableHead>
            <TableHead className="text-xs text-muted-foreground">{t("subscriptions.col.sendLink")}</TableHead>
            <TableHead className="w-0 px-4" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => {
            const s = STATUS[row.status];
            const statusLabel = s ? t(s.labelKey) : row.status;
            const statusVariant = s?.variant ?? ("outline" as const);

            return (
              <TableRow
                key={row.id}
                className="cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                role="button"
                tabIndex={0}
                onClick={() => open(row)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  open(row);
                }}
              >
                <TableCell className="px-4 font-medium">
                  {row.customers?.email ?? row.customers?.phone ?? "—"}
                </TableCell>

                <TableCell>
                  <Badge variant={statusVariant}>{statusLabel}</Badge>
                  {/* Stripe surfaces a pending cancellation next to the status,
                      because "Active" alone hides that billing is about to stop. */}
                  {row.cancel_at_period_end && row.status !== "canceled" ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t("subscriptions.cancelsOn", {
                        date: fmtDate(row.current_period_end),
                      })}
                    </span>
                  ) : null}
                </TableCell>

                <TableCell>
                  <span>{row.plans?.name ?? t("subscriptions.unknownPlan")}</span>
                  {row.plans?.code ? (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {row.plans.code}
                    </span>
                  ) : null}
                </TableCell>

                <TableCell className="text-right tabular-nums">
                  {formatMinorAmount(
                    row.plans?.amount_minor ?? 0,
                    row.plans?.currency ?? "UZS",
                  )}
                  {billingSuffix(row.plans) ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {billingSuffix(row.plans)}
                    </span>
                  ) : null}
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {row.status === "active" || row.status === "trialing"
                    ? fmtDate(row.current_period_end)
                    : "—"}
                </TableCell>

                {/* Stops the row navigation: copying the link is its own action,
                    not a slip on the way to the customer page. */}
                <TableCell
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {row.pay_url ? (
                    <PayLink url={row.pay_url} compact className="w-64" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                <TableCell className="px-4">
                  <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                  <span className="sr-only">Open customer</span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
