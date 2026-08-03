"use client";

import { Fragment, useEffect, useState } from "react";
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
import { cn } from "@/lib/utils";

type SubscriptionRow = {
  id: string;
  status: string;
  /** Open checkout link for the outstanding invoice, if the customer still owes one. */
  pay_url?: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  plans: {
    id: string;
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
  invoices?: Array<{
    id: string;
    status: string;
    amount_due_minor: number;
    currency: string;
    due_at: string | null;
    paid_at: string | null;
    attempt_count: number;
    billing_period_start: string | null;
    billing_period_end: string | null;
    payment_intent_id: string | null;
    created_at: string;
    payment_attempts?: Array<{
      id: string;
      provider_id: string;
      provider_payment_id: string | null;
      status: string;
      checkout_url: string | null;
      created_at: string;
      updated_at: string;
    }>;
  }>;
};

/** Short, scannable date — a table row is not the place for a full timestamp. */
function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

/**
 * Status presentation.
 *
 * `success` and `warning` are the two ratified status tokens (DESIGN.md) and
 * they are soft-bg pills, never saturated fills — state should read as calm.
 * Anything awaiting money from the customer is `warning`; anything finished or
 * inert is muted, so the eye lands only on rows that need action.
 */
const STATUS: Record<string, { label: string; variant: "success" | "warning" | "secondary" | "outline" }> = {
  active: { label: "Active", variant: "success" },
  trialing: { label: "Trialing", variant: "secondary" },
  past_due: { label: "Past due", variant: "warning" },
  incomplete: { label: "Incomplete", variant: "warning" },
  incomplete_expired: { label: "Expired", variant: "outline" },
  paused: { label: "Paused", variant: "secondary" },
  canceled: { label: "Canceled", variant: "outline" },
};

function statusOf(status: string) {
  return STATUS[status] ?? { label: status, variant: "outline" as const };
}

const INVOICE_STATUS: Record<string, "success" | "warning" | "outline"> = {
  paid: "success",
  open: "warning",
  uncollectible: "warning",
  void: "outline",
  draft: "outline",
};

function billingSuffix(plan: SubscriptionRow["plans"]) {
  if (!plan?.interval) return null;
  const n = plan.interval_count ?? 1;
  return n === 1 ? `/ ${plan.interval}` : `/ ${n} ${plan.interval}s`;
}

export function SubscriptionsListClient({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<SubscriptionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

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
        Loading subscriptions…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        No subscriptions yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="px-4 text-xs text-muted-foreground">Customer</TableHead>
            <TableHead className="text-xs text-muted-foreground">Status</TableHead>
            <TableHead className="text-xs text-muted-foreground">Plan</TableHead>
            <TableHead className="text-right text-xs text-muted-foreground">Amount</TableHead>
            <TableHead className="text-xs text-muted-foreground">Next invoice</TableHead>
            <TableHead className="w-0 px-4" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => {
            const isOpen = expanded === row.id;
            const s = statusOf(row.status);
            const invoices = row.invoices ?? [];

            return (
              <Fragment key={row.id}>
                <TableRow
                  className={cn(
                    "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                    isOpen && "border-b-0",
                  )}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={() => setExpanded(isOpen ? null : row.id)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    setExpanded(isOpen ? null : row.id);
                  }}
                >
                  <TableCell className="px-4 font-medium">
                    {row.customers?.email ?? row.customers?.phone ?? "—"}
                  </TableCell>

                  <TableCell>
                    <Badge variant={s.variant}>{s.label}</Badge>
                    {/* Stripe surfaces a pending cancellation next to the status,
                        because "Active" alone hides that billing is about to stop. */}
                    {row.cancel_at_period_end && row.status !== "canceled" ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        Cancels {fmtDate(row.current_period_end)}
                      </span>
                    ) : null}
                  </TableCell>

                  <TableCell>
                    <span>{row.plans?.name ?? "Unknown plan"}</span>
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

                  <TableCell className="px-4">
                    <ChevronRight
                      aria-hidden
                      className={cn(
                        "size-4 text-muted-foreground transition-transform",
                        isOpen && "rotate-90",
                      )}
                    />
                    <span className="sr-only">
                      {isOpen ? "Collapse details" : "Expand details"}
                    </span>
                  </TableCell>
                </TableRow>

                {isOpen ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="bg-muted/20 px-4 py-4 whitespace-normal">
                      {/* The customer is waiting on this link and we never sent
                          them anything — the merchant delivers it. */}
                      {row.pay_url ? (
                        <div className="mb-4">
                          <p className="mb-1.5 text-xs font-medium">
                            {row.status === "incomplete"
                              ? "Waiting for first payment — send this link"
                              : "Payment due — send this link"}
                          </p>
                          <PayLink url={row.pay_url} className="max-w-xl bg-background" />
                        </div>
                      ) : null}

                      <p className="mb-1.5 text-xs font-medium">Invoices</p>
                      {invoices.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No invoices recorded yet.
                        </p>
                      ) : (
                        <div className="overflow-hidden rounded-md border bg-background">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="h-8 px-3 text-xs text-muted-foreground">
                                  Status
                                </TableHead>
                                <TableHead className="h-8 text-right text-xs text-muted-foreground">
                                  Amount
                                </TableHead>
                                <TableHead className="h-8 text-xs text-muted-foreground">
                                  Period
                                </TableHead>
                                <TableHead className="h-8 text-xs text-muted-foreground">
                                  Due
                                </TableHead>
                                <TableHead className="h-8 text-xs text-muted-foreground">
                                  Paid
                                </TableHead>
                                <TableHead className="h-8 px-3 text-right text-xs text-muted-foreground">
                                  Attempts
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {invoices.map((invoice) => (
                                <TableRow key={invoice.id} className="hover:bg-transparent">
                                  <TableCell className="px-3">
                                    <Badge
                                      variant={INVOICE_STATUS[invoice.status] ?? "outline"}
                                    >
                                      {invoice.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatMinorAmount(
                                      invoice.amount_due_minor,
                                      invoice.currency,
                                    )}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {fmtDate(invoice.billing_period_start)} →{" "}
                                    {fmtDate(invoice.billing_period_end)}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {fmtDate(invoice.due_at)}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {fmtDate(invoice.paid_at)}
                                  </TableCell>
                                  <TableCell className="px-3 text-right tabular-nums text-muted-foreground">
                                    {invoice.attempt_count ?? 0}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {/* Provider-level attempts: only worth the space when a
                          charge actually went to a provider. */}
                      {invoices.some((i) => (i.payment_attempts?.length ?? 0) > 0) ? (
                        <div className="mt-4">
                          <p className="mb-1.5 text-xs font-medium">Payment attempts</p>
                          <ul className="space-y-1">
                            {invoices.flatMap((invoice) =>
                              (invoice.payment_attempts ?? []).map((attempt) => (
                                <li
                                  key={attempt.id}
                                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground"
                                >
                                  <span className="font-medium text-foreground">
                                    {attempt.provider_id}
                                  </span>
                                  <Badge
                                    variant={
                                      attempt.status === "succeeded"
                                        ? "success"
                                        : attempt.status === "failed"
                                          ? "warning"
                                          : "outline"
                                    }
                                  >
                                    {attempt.status}
                                  </Badge>
                                  <span>{fmtDateTime(attempt.updated_at)}</span>
                                  {attempt.provider_payment_id ? (
                                    <span className="font-mono">
                                      {attempt.provider_payment_id}
                                    </span>
                                  ) : null}
                                </li>
                              )),
                            )}
                          </ul>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
