import Link from "next/link";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { resolveActiveCustomerPortalSession } from "@/lib/customer-portal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function fmtDate(value: string | null | undefined) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function fmtMoney(amountMinor: number, currency: string | null | undefined) {
  const code = (currency || "UZS").toUpperCase();
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(amountMinor / 100);
  } catch {
    return `${amountMinor} ${code}`;
  }
}

function maskProviderToken(token: string | null | undefined) {
  if (!token) return "n/a";
  if (token.length <= 8) return token;
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function statusTone(status: string | null | undefined) {
  switch (String(status ?? "").toLowerCase()) {
    case "active":
    case "paid":
    case "succeeded":
      return "text-emerald-600";
    case "past_due":
    case "open":
    case "processing":
      return "text-amber-600";
    case "canceled":
    case "cancelled":
    case "uncollectible":
    case "failed":
      return "text-rose-600";
    default:
      return "text-muted-foreground";
  }
}

function getPendingPlanChange(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const rec = metadata as Record<string, unknown>;
  const pending =
    rec.pending_plan_change && typeof rec.pending_plan_change === "object"
      ? (rec.pending_plan_change as Record<string, unknown>)
      : null;
  if (!pending) return null;
  const planId = typeof pending.plan_id === "string" ? pending.plan_id : null;
  if (!planId) return null;
  return {
    planId,
    fromPlanId: typeof pending.from_plan_id === "string" ? pending.from_plan_id : null,
    requestedAt: typeof pending.requested_at === "string" ? pending.requested_at : null,
    effectiveAt: typeof pending.effective_at === "string" ? pending.effective_at : null,
    prorationBehavior:
      typeof pending.proration_behavior === "string" ? pending.proration_behavior : null,
  };
}

export default async function CustomerPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ session_token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session_token } = await params;
  const query = await searchParams;
  const successParam = Array.isArray(query.success) ? query.success[0] : query.success;
  const errorParam = Array.isArray(query.error) ? query.error[0] : query.error;

  const supabase = createAdminSupabase();
  const portal = await resolveActiveCustomerPortalSession(supabase, session_token);

  if (!portal.ok) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center px-6 py-16">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Customer Portal Session Unavailable</CardTitle>
            <CardDescription>
              This portal session is {portal.reason}. Request a new portal link from the app.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const session = portal.session;
  const [customerRes, subscriptionsRes, paymentMethodsRes] = await Promise.all([
    supabase
      .schema("payments")
      .from("customers")
      .select("id, email, phone, customer_org_id, customer_user_ref")
      .eq("id", session.customer_id)
      .maybeSingle(),
    supabase
      .schema("payments")
      .from("subscriptions")
      .select(
        "id, status, plan_id, cancel_at_period_end, current_period_start, current_period_end, created_at, updated_at, default_payment_method_id, metadata",
      )
      .eq("org_id", session.org_id)
      .eq("customer_id", session.customer_id)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .schema("payments")
      .from("payment_methods")
      .select("id, provider_id, provider_token, status, is_default, created_at")
      .eq("customer_id", session.customer_id)
      .order("created_at", { ascending: false }),
  ]);
  if (customerRes.error) throw customerRes.error;
  if (subscriptionsRes.error) throw subscriptionsRes.error;
  if (paymentMethodsRes.error) throw paymentMethodsRes.error;

  const subscriptions = subscriptionsRes.data ?? [];
  const planIds = Array.from(new Set(subscriptions.map((s) => s.plan_id).filter(Boolean)));

  const [plansRes, availablePlansRes, invoicesRes] = await Promise.all([
    planIds.length
      ? supabase.schema("payments").from("plans").select("id, name, amount_minor, currency").in("id", planIds)
      : Promise.resolve({ data: [], error: null } as any),
    supabase
      .schema("payments")
      .from("plans")
      .select("id, name, code, amount_minor, currency, interval_count, is_active")
      .eq("org_id", session.org_id)
      .eq("is_active", true)
      .order("amount_minor", { ascending: true }),
    subscriptions.length
      ? supabase
          .schema("payments")
          .from("invoices")
          .select(
            "id, subscription_id, status, amount_due_minor, currency, attempt_count, due_at, paid_at, billing_period_start, billing_period_end, created_at",
          )
          .in(
            "subscription_id",
            subscriptions.map((s) => s.id),
          )
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null } as any),
  ]);
  if (plansRes.error) throw plansRes.error;
  if (availablePlansRes.error) throw availablePlansRes.error;
  if (invoicesRes.error) throw invoicesRes.error;

  type PlanRow = { id: string; name: string | null; amount_minor: number; currency: string };
  type AvailablePlanRow = PlanRow & {
    code: string | null;
    interval_count: number | null;
    is_active: boolean;
  };
  type InvoiceRow = {
    id: string;
    subscription_id: string;
    status: string;
    amount_due_minor: number;
    currency: string;
    attempt_count: number;
    due_at: string | null;
    paid_at: string | null;
    billing_period_start: string | null;
    billing_period_end: string | null;
    created_at: string;
  };
  const typedPlans = (plansRes.data ?? []) as PlanRow[];
  const availablePlans = (availablePlansRes.data ?? []) as AvailablePlanRow[];
  const typedInvoices = (invoicesRes.data ?? []) as InvoiceRow[];

  const plansById = new Map<string, PlanRow>(typedPlans.map((plan) => [plan.id, plan]));
  const invoicesBySubscription = new Map<string, InvoiceRow[]>();
  for (const invoice of typedInvoices) {
    const list = invoicesBySubscription.get(invoice.subscription_id) ?? [];
    list.push(invoice);
    invoicesBySubscription.set(invoice.subscription_id, list);
  }

  const flowType = typeof session.flow_type === "string" ? session.flow_type : null;
  const flowData =
    session.flow_data && typeof session.flow_data === "object"
      ? (session.flow_data as Record<string, unknown>)
      : {};
  const highlightedSubscriptionId =
    typeof flowData.subscriptionId === "string" ? flowData.subscriptionId : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
            Krafta Pay Customer Portal
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Billing & Subscription Management</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Hosted billing portal session. Expires: {fmtDate(session.expires_at)}
          </p>
          {flowType ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Requested flow: <span className="font-mono">{flowType}</span>
            </p>
          ) : null}
        </div>
        {session.return_url ? (
          <Link
            href={String(session.return_url)}
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            Return to App
          </Link>
        ) : null}
      </div>

      {successParam ? (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successParam === "cancel_at_period_end_set"
            ? "Subscription will cancel at the end of the current billing period."
            : successParam === "already_canceled"
              ? "Subscription is already canceled."
              : successParam === "payment_method_updated"
                ? "Payment method updated. The new Uzum card binding was saved for future charges."
                : successParam === "plan_updated"
                  ? "Subscription plan updated. No proration invoice was created (proration behavior: none)."
                  : successParam === "plan_update_scheduled"
                    ? "Plan change scheduled for the next renewal (apply at period end)."
                    : successParam === "plan_unchanged"
                      ? "Subscription is already on that plan."
            : successParam}
        </div>
      ) : null}
      {errorParam ? (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorParam === "subscription_not_found"
            ? "Subscription not found for this customer portal session."
            : errorParam === "expired"
              ? "This portal session has expired. Request a new portal link from the app."
              : errorParam === "payment_method_update_canceled"
                ? "Card update flow was canceled."
              : "Could not complete the requested action. Please try again from the app."}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
            <CardDescription>Portal session identity and contact info.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Customer ID:</span>{" "}
              <span className="font-mono">{session.customer_id}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Customer Org ID:</span>{" "}
              <span className="font-mono">{customerRes.data?.customer_org_id ?? "n/a"}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Customer User Ref:</span>{" "}
              <span className="font-mono">{customerRes.data?.customer_user_ref ?? "n/a"}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Email:</span> {customerRes.data?.email ?? "n/a"}
            </p>
            <p>
              <span className="text-muted-foreground">Phone:</span> {customerRes.data?.phone ?? "n/a"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
            <CardDescription>
              Stored methods available for recurring billing (BYO acquirer aware).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              method="post"
              action={`/portal/${encodeURIComponent(session_token)}/payment-methods/uzum/update`}
              className="mb-3"
            >
              {highlightedSubscriptionId ? (
                <input type="hidden" name="subscriptionId" value={highlightedSubscriptionId} />
              ) : null}
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted"
              >
                {paymentMethodsRes.data?.length ? "Update Uzum Card" : "Add Uzum Card"}
              </button>
            </form>
            {(paymentMethodsRes.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved payment methods yet.</p>
            ) : (
              (paymentMethodsRes.data ?? []).map((pm) => (
                <div
                  key={pm.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {pm.provider_id.toUpperCase()}{" "}
                      {pm.is_default ? (
                        <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs">Default</span>
                      ) : null}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {maskProviderToken(pm.provider_token)}
                    </p>
                  </div>
                  <p className={`text-xs font-medium ${statusTone(pm.status)}`}>{pm.status}</p>
                </div>
              ))
            )}
            <p className="text-xs text-muted-foreground">
              Uzum card updates use a bind-only hosted flow and save a new <span className="font-mono">bindingId</span>{" "}
              for future renewals.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions</CardTitle>
            <CardDescription>
              Hosted self-service management (MVP: status visibility + cancel at period end).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No subscriptions found for this customer.</p>
            ) : (
              subscriptions.map((subscription) => {
                const plan = plansById.get(subscription.plan_id);
                const invoices = invoicesBySubscription.get(subscription.id) ?? [];
                const latestInvoice = invoices[0];
                const isHighlighted = highlightedSubscriptionId === subscription.id;
                const pendingPlanChange = getPendingPlanChange((subscription as any).metadata);
                const pendingPlan = pendingPlanChange ? availablePlans.find((p) => p.id === pendingPlanChange.planId) : null;
                return (
                  <div
                    key={subscription.id}
                    className={`rounded-xl border p-4 ${
                      isHighlighted ? "border-primary ring-2 ring-primary/15" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">
                          {plan?.name ?? "Subscription"}{" "}
                          <span className={`ml-2 text-xs font-medium ${statusTone(subscription.status)}`}>
                            {subscription.status}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground font-mono">
                          {subscription.id}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Next renewal: {fmtDate(subscription.current_period_end)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Cancel at period end: {subscription.cancel_at_period_end ? "Yes" : "No"}
                        </p>
                        {plan ? (
                          <p className="text-sm text-muted-foreground">
                            Plan amount: {fmtMoney(plan.amount_minor, plan.currency)}
                          </p>
                        ) : null}
                        {pendingPlanChange ? (
                          <p className="text-sm text-muted-foreground">
                            Pending plan change:{" "}
                            <span className="font-medium text-foreground">
                              {pendingPlan?.name ?? pendingPlanChange.planId}
                            </span>{" "}
                            ({pendingPlanChange.effectiveAt ?? "scheduled"}) · requested{" "}
                            {fmtDate(pendingPlanChange.requestedAt)}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex min-w-[270px] flex-col items-end gap-2">
                        <form
                          method="post"
                          action={`/portal/${encodeURIComponent(session_token)}/subscriptions/${encodeURIComponent(subscription.id)}/cancel`}
                        >
                          <button
                            type="submit"
                            className="inline-flex h-9 items-center rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            disabled={
                              subscription.cancel_at_period_end || subscription.status === "canceled"
                            }
                          >
                            {subscription.cancel_at_period_end ? "Cancellation Scheduled" : "Cancel at Period End"}
                          </button>
                        </form>
                        <p className="text-xs text-muted-foreground">
                          Stripe-like portal parity: hosted cancel and plan-change flows.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg border bg-muted/10 p-3">
                      <form
                        method="post"
                        action={`/portal/${encodeURIComponent(session_token)}/subscriptions/${encodeURIComponent(subscription.id)}/update`}
                        className="grid gap-3 md:grid-cols-[1.4fr_1fr_auto]"
                      >
                        <label className="text-sm">
                          <span className="mb-1 block text-xs text-muted-foreground">Plan</span>
                          <select
                            name="planId"
                            defaultValue={pendingPlanChange?.planId ?? subscription.plan_id}
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                          >
                            {availablePlans.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name ?? "Plan"} · {fmtMoney(p.amount_minor, p.currency)}
                                {p.interval_count ? ` / ${p.interval_count} mo` : ""}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="text-sm">
                          <span className="mb-1 block text-xs text-muted-foreground">Proration</span>
                          <select
                            name="prorationBehavior"
                            defaultValue="defer_to_period_end"
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                          >
                            <option value="defer_to_period_end">Apply at period end</option>
                            <option value="none">No proration (immediate)</option>
                          </select>
                        </label>

                        <div className="flex items-end">
                          <button
                            type="submit"
                            className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
                          >
                            Update plan
                          </button>
                        </div>
                      </form>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Proration invoices are not created yet in Krafta Pay. “No proration” changes the plan immediately;
                        “Apply at period end” schedules the switch for the next successful renewal charge.
                      </p>
                    </div>

                    {latestInvoice ? (
                      <div className="mt-4 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                        <p>
                          Latest invoice:{" "}
                          <span className={`font-medium ${statusTone(latestInvoice.status)}`}>
                            {latestInvoice.status}
                          </span>{" "}
                          ({fmtMoney(latestInvoice.amount_due_minor, latestInvoice.currency)})
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Attempts: {latestInvoice.attempt_count} · Due: {fmtDate(latestInvoice.due_at)} · Paid:{" "}
                          {fmtDate(latestInvoice.paid_at)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoice History</CardTitle>
            <CardDescription>
              Recent invoices across this customer’s subscriptions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(invoicesRes.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Created</th>
                      <th className="py-2 pr-3 font-medium">Subscription</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Amount</th>
                      <th className="py-2 pr-3 font-medium">Attempts</th>
                      <th className="py-2 pr-3 font-medium">Billing Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typedInvoices.map((invoice) => (
                      <tr key={invoice.id} className="border-t">
                        <td className="py-2 pr-3">{fmtDate(invoice.created_at)}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{invoice.subscription_id}</td>
                        <td className={`py-2 pr-3 font-medium ${statusTone(invoice.status)}`}>
                          {invoice.status}
                        </td>
                        <td className="py-2 pr-3">
                          {fmtMoney(invoice.amount_due_minor, invoice.currency)}
                        </td>
                        <td className="py-2 pr-3">{invoice.attempt_count}</td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                          {fmtDate(invoice.billing_period_start)} → {fmtDate(invoice.billing_period_end)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
