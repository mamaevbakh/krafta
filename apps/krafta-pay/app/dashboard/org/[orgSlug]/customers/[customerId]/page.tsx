import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrgAccess } from "@/lib/org-access";
import { PortalLinkButton } from "../portal-link-button.client";
import { payDateFormatter } from "@/lib/format-date";
import { getPayLocale, getPayT } from "@/lib/locales/server";
import type { PayMessageKey } from "@/lib/locales/catalog";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { formatMinorAmount } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PayLink } from "@/components/dashboard/pay-link.client";
import { CustomerName } from "./customer-name.client";
import { StartSubscription, type PlanOption } from "./start-subscription.client";

/**
 * Customer detail — the page a subscription row opens into.
 *
 * Modelled on Stripe's customer view rather than a subscription view: a
 * merchant chasing a payment thinks in people ("has Aziz paid?"), not in
 * subscription ids. Everything that person owes, has paid, and is signed up
 * for belongs on one page.
 *
 * A route rather than an overlay, deliberately — it is linkable, the browser
 * back button works, and a merchant can send a teammate "look at this
 * customer" without describing which row to click.
 */

type Params = Promise<{ orgSlug: string; customerId: string }>;

type PlanRef = {
  name: string;
  code: string;
  amount_minor: number;
  currency: string;
  interval: string | null;
  interval_count: number | null;
} | null;

type CustomerRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  external_id: string | null;
  environment: string | null;
  created_at: string;
};

type SubRow = {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  created_at: string;
  plans: PlanRef;
};

type InvoiceRow = {
  id: string;
  status: string;
  amount_due_minor: number;
  currency: string;
  due_at: string | null;
  paid_at: string | null;
  attempt_count: number;
  payment_intent_id: string | null;
  created_at: string;
};

type MethodRow = {
  id: string;
  provider_id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
  status: string;
  created_at: string;
};

const SUB_STATUS: Record<
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

/** Invoice status copy, keyed the same way so an unknown value falls back loudly. */
const INVOICE_STATUS_LABEL: Record<string, PayMessageKey> = {
  paid: "invoice.status.paid",
  open: "invoice.status.open",
  uncollectible: "invoice.status.uncollectible",
  void: "invoice.status.void",
  draft: "invoice.status.draft",
};

const INVOICE_STATUS: Record<string, "success" | "warning" | "outline"> = {
  paid: "success",
  open: "warning",
  uncollectible: "warning",
  void: "outline",
  draft: "outline",
};


/**
 * "/ месяц", not "/ month".
 *
 * `plan.interval` is a database value — the literal string `month` — and
 * printing it put an English word next to a UZS amount on an otherwise Russian
 * page. The pluralised English form ("/ 12 months") was worse: it never
 * translated and never will.
 */
function billingSuffix(
  plan: { interval?: string | null; interval_count?: number | null } | null,
  t: Awaited<ReturnType<typeof getPayT>>,
) {
  if (!plan?.interval) return null;
  const n = Number(plan.interval_count ?? 1) || 1;
  return n === 1
    ? `/ ${t("subscriptions.interval.month")}`
    : `/ ${t("subscriptions.interval.months", { count: n })}`;
}

export default async function CustomerDetailPage({ params }: { params: Params }) {
  const t = await getPayT();
  const fmtDate = payDateFormatter(await getPayLocale());
  const { orgSlug, customerId } = await params;
  const org = await requireOrgAccess(orgSlug);
  const admin = createAdminSupabase();
  // The generated Supabase types lag the payments schema (external_id and
  // environment were added after the last type-gen), so queries go through a
  // loosened client. Every result below is re-typed explicitly, so the untyped
  // surface stops at this line.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  // Scoped by org_id as well as id. Without the org filter this route would
  // read any merchant's customer given a guessed uuid — the id alone is not an
  // authorization check.
  const { data: customer, error: customerErr } = await adminAny
    .schema("payments")
    .from("customers")
    .select("id, name, email, phone, external_id, environment, created_at, metadata")
    .eq("id", customerId)
    .eq("org_id", org.orgId)
    .maybeSingle();
  if (customerErr) throw customerErr;
  if (!customer) notFound();
  const person = customer as CustomerRow;

  const { data: subsData, error: subsErr } = await adminAny
    .schema("payments")
    .from("subscriptions")
    .select(
      "id, status, cancel_at_period_end, current_period_start, current_period_end, created_at, canceled_at, plans:plan_id(name, code, amount_minor, currency, interval, interval_count)",
    )
    .eq("customer_id", customerId)
    .eq("org_id", org.orgId)
    .order("created_at", { ascending: false });
  if (subsErr) throw subsErr;
  const subscriptions = (subsData ?? []) as SubRow[];

  const subIds = subscriptions.map((s) => s.id);
  let invoices: InvoiceRow[] = [];
  if (subIds.length > 0) {
    const { data, error } = await adminAny
      .schema("payments")
      .from("invoices")
      .select(
        "id, subscription_id, status, amount_due_minor, currency, due_at, paid_at, attempt_count, payment_intent_id, created_at",
      )
      .in("subscription_id", subIds)
      .order("created_at", { ascending: false });
    if (error) throw error;
    invoices = data ?? [];
  }

  // Open checkout link for whatever is still owed — same read as the index, so
  // the merchant can hand the link over from here too.
  const unpaidIntentIds = invoices
    .filter((i) => i.status !== "paid" && i.status !== "void")
    .map((i) => i.payment_intent_id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  const openTokenByIntentId = new Map<string, string>();
  if (unpaidIntentIds.length > 0) {
    const { data, error } = await adminAny
      .schema("payments")
      .from("checkout_sessions")
      .select("payment_intent_id, public_token, created_at")
      .in("payment_intent_id", unpaidIntentIds)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    if (error) throw error;
    for (const s of data ?? []) {
      const k = String(s.payment_intent_id ?? "");
      if (k && !openTokenByIntentId.has(k)) openTokenByIntentId.set(k, String(s.public_token));
    }
  }

  const { data: methodsData, error: methodsErr } = await adminAny
    .schema("payments")
    .from("payment_methods")
    .select("id, provider_id, brand, last4, exp_month, exp_year, is_default, status, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (methodsErr) throw methodsErr;
  const methods = (methodsData ?? []) as MethodRow[];

  // Lifetime paid, in the currency the invoices were actually billed in.
  const paidByCurrency = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.status !== "paid") continue;
    const cur = String(inv.currency ?? "UZS");
    paidByCurrency.set(cur, (paidByCurrency.get(cur) ?? 0) + Number(inv.amount_due_minor ?? 0));
  }
  const totalPaid =
    paidByCurrency.size === 0
      ? "—"
      : [...paidByCurrency.entries()].map(([cur, amt]) => formatMinorAmount(amt, cur)).join(" · ");

  const activeCount = subscriptions.filter(
    (s) => s.status === "active" || s.status === "trialing",
  ).length;
  const outstanding = invoices.filter((i) => i.status === "open" || i.status === "uncollectible");

  const payUrlBase = (process.env.PAY_BASE_URL ?? "").replace(/\/+$/, "");

  // The plans this merchant can put someone on. Read here rather than in the
  // client component so the page arrives with them and the button does not
  // flash empty — and so a merchant with no plans yet never sees the control at
  // all, instead of a picker with nothing in it.
  const { data: planRows, error: plansErr } = await adminAny
    .schema("payments")
    .from("plans")
    .select("id, name, amount_minor, currency, interval, interval_count")
    .eq("org_id", org.orgId)
    .eq("is_active", true)
    .order("amount_minor", { ascending: true });
  if (plansErr) throw plansErr;

  const planOptions: PlanOption[] = (planRows ?? []).map(
    (plan: Record<string, unknown>) => {
      const count = Number(plan.interval_count ?? 1) || 1;
      // Name, price and cadence in one line, worded exactly as the plan picker
      // on the Subscriptions page — a merchant choosing between two plans
      // called "Pro" needs the amount, and the cadence has to be in their
      // language rather than the raw `month` the column stores.
      const cadence =
        count === 1
          ? t("subscriptions.interval.month")
          : t("subscriptions.interval.months", { count });
      const amount = formatMinorAmount(
        Number(plan.amount_minor ?? 0),
        String(plan.currency ?? "UZS"),
      );
      return {
        id: String(plan.id),
        label: `${String(plan.name ?? "—")} — ${amount} / ${cadence}`,
      };
    },
  );

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/dashboard/org/${orgSlug}/subscriptions`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {t("page.subscriptions.title")}
        </Link>

        <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <CustomerName
              customerId={person.id}
              orgSlug={orgSlug}
              initialName={person.name}
              fallback={person.email ?? person.phone ?? t("customer.fallbackName")}
            />
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {person.email && person.phone ? <span>{person.phone}</span> : null}
              <span>{t("customer.since", { date: fmtDate(person.created_at) })}</span>
              {person.external_id ? (
                <span className="font-mono text-xs">{person.external_id}</span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {person.environment === "test" ? (
              <Badge variant="warning">{t("customer.testBadge")}</Badge>
            ) : null}
            {/* The portal has existed and worked for months; until now the only
                way to open a session was the API, so a merchant without an
                engineer could not give their customer access at all. */}
            <PortalLinkButton orgSlug={orgSlug} customerId={person.id} />
          </div>
        </header>
      </div>

      {/* Stripe leads the customer page with the numbers you came to check. */}
      <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
        <div className="bg-background p-4">
          <dt className="text-xs text-muted-foreground">{t("customer.stat.totalPaid")}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{totalPaid}</dd>
        </div>
        <div className="bg-background p-4">
          <dt className="text-xs text-muted-foreground">{t("customer.stat.activeSubs")}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{activeCount}</dd>
        </div>
        <div className="bg-background p-4">
          <dt className="text-xs text-muted-foreground">{t("customer.stat.outstanding")}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">
            {outstanding.length === 0
              ? "—"
              : formatMinorAmount(
                  outstanding.reduce((sum, i) => sum + Number(i.amount_due_minor ?? 0), 0),
                  String(outstanding[0].currency ?? "UZS"),
                )}
          </dd>
        </div>
      </dl>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">{t("page.subscriptions.title")}</h2>
          <StartSubscription
            orgSlug={orgSlug}
            customerId={person.id}
            plans={planOptions}
          />
        </div>
        {subscriptions.length === 0 ? (
          <div className="rounded-lg border p-6 text-sm text-muted-foreground">
            {t("customer.subscriptions.empty")}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 text-xs text-muted-foreground">{t("subscriptions.col.plan")}</TableHead>
                  <TableHead className="text-xs text-muted-foreground">{t("subscriptions.col.status")}</TableHead>
                  <TableHead className="text-right text-xs text-muted-foreground">{t("subscriptions.col.amount")}</TableHead>
                  <TableHead className="text-xs text-muted-foreground">{t("customer.col.started")}</TableHead>
                  <TableHead className="px-4 text-xs text-muted-foreground">{t("subscriptions.col.nextInvoice")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((s) => {
                  const st = SUB_STATUS[s.status];
                  const statusLabel = st ? t(st.labelKey) : s.status;
                  const statusVariant = st?.variant ?? ("outline" as const);
                  const plan = s.plans;
                  return (
                    <TableRow key={s.id} className="hover:bg-transparent">
                      <TableCell className="px-4">
                        <span className="font-medium">{plan?.name ?? "Unknown plan"}</span>
                        {plan?.code ? (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {plan.code}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant}>{statusLabel}</Badge>
                        {s.cancel_at_period_end && s.status !== "canceled" ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {t("subscriptions.cancelsOn", {
                              date: fmtDate(s.current_period_end),
                            })}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinorAmount(
                          Number(plan?.amount_minor ?? 0),
                          String(plan?.currency ?? "UZS"),
                        )}
                        {billingSuffix(plan, t) ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            {billingSuffix(plan, t)}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {fmtDate(s.created_at)}
                      </TableCell>
                      <TableCell className="px-4 text-muted-foreground">
                        {s.status === "active" || s.status === "trialing"
                          ? fmtDate(s.current_period_end)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">{t("customer.invoices.heading")}</h2>
        {invoices.length === 0 ? (
          <div className="rounded-lg border p-6 text-sm text-muted-foreground">{t("customer.invoices.empty")}</div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 text-xs text-muted-foreground">{t("subscriptions.col.status")}</TableHead>
                  <TableHead className="text-right text-xs text-muted-foreground">{t("subscriptions.col.amount")}</TableHead>
                  <TableHead className="text-xs text-muted-foreground">{t("payments.col.created")}</TableHead>
                  <TableHead className="text-xs text-muted-foreground">{t("customer.col.due")}</TableHead>
                  <TableHead className="text-xs text-muted-foreground">{t("payments.col.paid")}</TableHead>
                  <TableHead className="px-4 text-xs text-muted-foreground">{t("subscriptions.col.sendLink")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const token = openTokenByIntentId.get(String(inv.payment_intent_id ?? ""));
                  return (
                    <TableRow key={inv.id} className="hover:bg-transparent">
                      <TableCell className="px-4">
                        <Badge variant={INVOICE_STATUS[inv.status] ?? "outline"}>
                          {INVOICE_STATUS_LABEL[inv.status]
                            ? t(INVOICE_STATUS_LABEL[inv.status])
                            : inv.status}
                        </Badge>
                        {Number(inv.attempt_count ?? 0) > 1 ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {inv.attempt_count} attempts
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinorAmount(Number(inv.amount_due_minor ?? 0), String(inv.currency))}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {fmtDate(inv.created_at)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{fmtDate(inv.due_at)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {fmtDate(inv.paid_at)}
                      </TableCell>
                      <TableCell className="px-4">
                        {token && payUrlBase ? (
                          <PayLink url={`${payUrlBase}/pay/${token}`} compact className="w-72" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">{t("customer.methods.heading")}</h2>
        {methods.length === 0 ? (
          <div className="rounded-lg border p-6 text-sm text-muted-foreground">
            {t("customer.methods.empty")}
          </div>
        ) : (
          <ul className="divide-y overflow-hidden rounded-lg border">
            {methods.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4 text-sm">
                <span className="font-medium capitalize">{m.brand ?? m.provider_id}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  •••• {m.last4 ?? "????"}
                </span>
                {m.exp_month && m.exp_year ? (
                  <span className="text-muted-foreground tabular-nums">
                    {String(m.exp_month).padStart(2, "0")}/{String(m.exp_year).slice(-2)}
                  </span>
                ) : null}
                {m.is_default ? <Badge variant="secondary">{t("customer.methods.default")}</Badge> : null}
                {m.status !== "active" ? <Badge variant="outline">{m.status}</Badge> : null}
                <span className="ml-auto text-xs text-muted-foreground">
                  {t("customer.methods.added", { date: fmtDate(m.created_at) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
