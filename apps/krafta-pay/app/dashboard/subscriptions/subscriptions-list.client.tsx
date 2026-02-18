"use client";

import { useEffect, useMemo, useState } from "react";
import type { MembershipOption } from "@/lib/org-memberships";

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
};

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
          className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
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
                <p className="font-medium">
                  {row.plans?.name ?? "Unknown plan"} · {row.status}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.plans?.amount_minor ?? 0} {row.plans?.currency ?? "UZS"} · code{" "}
                  {row.plans?.code ?? "-"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Customer: {row.customers?.email ?? row.customers?.phone ?? "n/a"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Period: {row.current_period_start ?? "n/a"} → {row.current_period_end ?? "n/a"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Cancel at period end: {row.cancel_at_period_end ? "yes" : "no"}
                </p>
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
