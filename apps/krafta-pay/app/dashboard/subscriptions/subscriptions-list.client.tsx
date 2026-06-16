"use client";

import { useEffect, useMemo, useState } from "react";
import type { MembershipOption } from "@/lib/org-memberships";
import { formatMinorAmount } from "@/lib/format";

type SubscriptionRow = {
  id: string;
  status: string;
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

function fmtDateTime(value?: string | null) {
  if (!value) return "n/a";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export function SubscriptionsListClient({
  memberships,
  initialOrgId,
}: {
  memberships: MembershipOption[];
  initialOrgId?: string;
}) {
  const [orgId, setOrgId] = useState(initialOrgId || memberships[0]?.orgId || "");
  const [rows, setRows] = useState<SubscriptionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedMembership = useMemo(
    () => memberships.find((membership) => membership.orgId === orgId) ?? null,
    [memberships, orgId],
  );

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

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-background p-4">
        <label className="text-sm font-medium" htmlFor="subscriptions-org">
          Organization
        </label>
        <select
          id="subscriptions-org"
          className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-base md:text-sm"
          value={orgId}
          onChange={(e) => {
            setOrgId(e.target.value);
            setRows(null);
            setError(null);
          }}
        >
          {memberships.map((membership) => (
            <option key={membership.orgId} value={membership.orgId}>
              {membership.orgName} ({membership.role})
            </option>
          ))}
        </select>
        {selectedMembership ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Org slug: {selectedMembership.orgSlug}
          </p>
        ) : null}
      </div>

      <div className="rounded-md border bg-background p-4">
        <h2 className="text-sm font-medium">Subscriptions</h2>
        {rows === null ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading subscriptions...</p>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No subscriptions yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {row.plans?.name ?? "Unknown plan"} · {row.status}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono tabular-nums">
                        {formatMinorAmount(row.plans?.amount_minor ?? 0, row.plans?.currency ?? "UZS")}
                      </span>{" "}
                      · code {row.plans?.code ?? "-"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Customer: {row.customers?.email ?? row.customers?.phone ?? "n/a"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Period: {fmtDateTime(row.current_period_start)} → {fmtDateTime(row.current_period_end)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Cancel at period end: {row.cancel_at_period_end ? "yes" : "no"}
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
                    {row.invoices?.length ?? 0} invoice{(row.invoices?.length ?? 0) === 1 ? "" : "s"}
                  </div>
                </div>

                <details className="mt-3 rounded-md border bg-muted/10 p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Charges and invoices
                  </summary>
                  {!(row.invoices?.length) ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      No invoices/charges recorded yet.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {row.invoices!.map((invoice) => (
                        <div key={invoice.id} className="rounded-md border bg-background p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">
                                Invoice {invoice.status} ·{" "}
                                <span className="font-mono tabular-nums">
                                  {formatMinorAmount(invoice.amount_due_minor, invoice.currency)}
                                </span>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Period: {fmtDateTime(invoice.billing_period_start)} → {fmtDateTime(invoice.billing_period_end)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Due: {fmtDateTime(invoice.due_at)} · Paid: {fmtDateTime(invoice.paid_at)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Attempts: {invoice.attempt_count ?? 0} · Payment intent: {invoice.payment_intent_id ?? "n/a"}
                              </p>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              <p>Created</p>
                              <p>{fmtDateTime(invoice.created_at)}</p>
                            </div>
                          </div>

                          <div className="mt-3 rounded-md border bg-muted/20 p-2">
                            <p className="text-xs font-medium">Payment attempts</p>
                            {!(invoice.payment_attempts?.length) ? (
                              <p className="mt-2 text-xs text-muted-foreground">
                                No payment attempts yet.
                              </p>
                            ) : (
                              <div className="mt-2 space-y-2">
                                {invoice.payment_attempts!.map((attempt) => (
                                  <div key={attempt.id} className="rounded-md border bg-background p-2">
                                    <p className="text-xs font-medium">
                                      {attempt.provider_id} · {attempt.status}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Provider payment ID: {attempt.provider_payment_id ?? "n/a"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Created: {fmtDateTime(attempt.created_at)} · Updated: {fmtDateTime(attempt.updated_at)}
                                    </p>
                                    {attempt.checkout_url ? (
                                      <p className="truncate text-xs text-muted-foreground">
                                        Checkout URL: {attempt.checkout_url}
                                      </p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </details>
              </div>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}
