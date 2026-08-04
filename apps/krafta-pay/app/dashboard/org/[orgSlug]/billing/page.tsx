import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requireOrgAccess } from "@/lib/org-access";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getPlatformBillingExemption, loadPlatformBilling } from "@/lib/platform-billing-view";
import { payDateFormatter } from "@/lib/format-date";
import { getPayLocale, getPayT } from "@/lib/locales/server";
import { formatMinorAmount } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { attachPlatformCardAction } from "./actions";

/**
 * Billing — the other direction of money.
 *
 * Every other page in this dashboard is about the merchant charging their
 * customers. This one is about us charging the merchant, and it exists so that
 * relationship is never a surprise: the plan, the rate, the volume we metered,
 * the fee that produces, and the card it will come off.
 *
 * The usage figure shown here is computed with the same query the period close
 * uses. That is the whole point — a merchant who cannot reproduce their invoice
 * from this page will dispute it.
 */

type Params = Promise<{ orgSlug: string }>;
type Search = Promise<{ cardError?: string }>;

const INVOICE_STATUS_VARIANT: Record<string, "success" | "warning" | "outline"> = {
  paid: "success",
  open: "warning",
  uncollectible: "warning",
  void: "outline",
  draft: "outline",
};

const INVOICE_STATUS_KEY = {
  paid: "billing.status.paid",
  open: "billing.status.open",
  uncollectible: "billing.status.uncollectible",
  void: "billing.status.void",
  draft: "billing.status.draft",
} as const;


export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { orgSlug } = await params;
  const { cardError } = await searchParams;
  const org = await requireOrgAccess(orgSlug);
  const t = await getPayT();
  const fmtDate = payDateFormatter(await getPayLocale());

  const admin = createAdminSupabase();
  // The generated Supabase types lag the payments schema (features and
  // invoice_line_items are newer than the last type-gen), so this goes through a
  // loosened client. Every field is re-typed in platform-billing-view.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  // An exempt org gets a plain statement rather than a 404. Every organization
  // on production at launch is exempt, so a 404 here would break the nav item
  // for every existing user — and "you are not billed" is information they
  // should be able to confirm for themselves, not an error page.
  const exemption = await getPlatformBillingExemption(adminAny, org.orgId);
  if (exemption) {
    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{t("billing.title")}</h1>
        </header>
        <div className="rounded-lg border p-6">
          <p className="text-sm font-medium">{t("billing.exempt.title")}</p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {t("billing.exempt.body")}
          </p>
        </div>
      </div>
    );
  }

  const view = await loadPlatformBilling(adminAny, org.orgId);

  // Krafta Pay does not bill Krafta Pay. loadPlatformBilling returns null for
  // the platform org rather than provisioning it into its own merchant loop.
  if (!view) notFound();

  const ratePercent = view.pricing.usageRateBps / 100;
  const capLabel =
    view.pricing.usageCapMinor === null
      ? null
      : formatMinorAmount(view.pricing.usageCapMinor, view.currency);
  const capUsedRatio =
    view.pricing.usageCapMinor && view.pricing.usageCapMinor > 0
      ? Math.min(1, view.usageFeeMinor / view.pricing.usageCapMinor)
      : null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("billing.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("billing.subtitle")}</p>
      </header>

      {view.status === "past_due" ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {t("billing.pastDue")}
        </div>
      ) : null}

      {cardError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {cardError}
        </div>
      ) : null}

      {/* Plan + what the next bill comes to. The two numbers a merchant opens
          this page to find, side by side and above everything else. */}
      <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2">
        <div className="bg-background p-4">
          <dt className="text-xs text-muted-foreground">{t("billing.currentPlan")}</dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-lg font-semibold">{view.planName}</span>
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {t("billing.planFee", {
                amount: formatMinorAmount(view.planAmountMinor, view.currency),
              })}
            </span>
          </dd>
          <p className="mt-1 text-xs text-muted-foreground">
            {capLabel
              ? t("billing.usageRateCapped", { rate: ratePercent, cap: capLabel })
              : t("billing.usageRate", { rate: ratePercent })}
          </p>
        </div>

        <div className="bg-background p-4">
          <dt className="text-xs text-muted-foreground">{t("billing.nextInvoice")}</dt>
          <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">
            {formatMinorAmount(view.estimatedNextInvoiceMinor, view.currency)}
          </dd>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("billing.nextInvoiceOn", { date: fmtDate(view.currentPeriodEnd) })}
          </p>
        </div>
      </dl>

      {/* Usage this period */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">{t("billing.thisPeriod")}</h2>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {t("billing.periodRange", {
              start: fmtDate(view.currentPeriodStart),
              end: fmtDate(view.currentPeriodEnd),
            })}
          </p>
        </div>

        <div className="rounded-lg border">
          <dl className="grid gap-px bg-border sm:grid-cols-2">
            <div className="bg-background p-4">
              <dt className="text-xs text-muted-foreground">{t("billing.volumeProcessed")}</dt>
              <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {formatMinorAmount(view.usageBaseMinor, view.currency)}
              </dd>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("billing.chargesCount", { count: view.usageCharges })}
              </p>
            </div>
            <div className="bg-background p-4">
              <dt className="text-xs text-muted-foreground">{t("billing.feeAccrued")}</dt>
              <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {formatMinorAmount(view.usageFeeMinor, view.currency)}
              </dd>
              <p className="mt-1 text-xs text-muted-foreground">
                {capLabel
                  ? t("billing.usageRateCapped", { rate: ratePercent, cap: capLabel })
                  : t("billing.usageRate", { rate: ratePercent })}
              </p>
            </div>
          </dl>

          {/* Cap progress. Only drawn where a cap exists — an uncapped tier has
              nothing to fill up, and a bar at 0% forever would just be noise. */}
          {capUsedRatio !== null && capLabel ? (
            <div className="border-t p-4">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={Math.round(capUsedRatio * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t("billing.capProgress", {
                  used: formatMinorAmount(view.usageFeeMinor, view.currency),
                  cap: capLabel,
                })}
              >
                <div
                  className={view.usageCapped ? "h-full bg-warning" : "h-full bg-foreground"}
                  style={{ width: `${Math.max(capUsedRatio * 100, capUsedRatio > 0 ? 2 : 0)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {view.usageCapped
                  ? t("billing.capReached", { cap: capLabel })
                  : t("billing.capProgress", {
                      used: formatMinorAmount(view.usageFeeMinor, view.currency),
                      cap: capLabel,
                    })}
              </p>
            </div>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">{t("billing.planChangeNote")}</p>
      </section>

      {/* Payment method */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">{t("billing.paymentMethod")}</h2>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div className="min-w-0">
            {view.paymentMethod ? (
              <>
                <p className="font-mono text-sm tabular-nums">
                  {t("billing.cardOnFile", {
                    brand: view.paymentMethod.brand ?? "Card",
                    last4: view.paymentMethod.last4 ?? "····",
                  })}
                </p>
                {view.paymentMethod.expMonth && view.paymentMethod.expYear ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("billing.cardExpires", {
                      month: String(view.paymentMethod.expMonth).padStart(2, "0"),
                      year: String(view.paymentMethod.expYear).slice(-2),
                    })}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-sm font-medium">{t("billing.noCard")}</p>
                <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                  {t("billing.noCardHint")}
                </p>
              </>
            )}
          </div>

          {/* Owners and admins only — the action itself re-checks the role. */}
          {org.role === "owner" || org.role === "admin" ? (
            <form action={attachPlatformCardAction}>
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <Button type="submit" variant={view.paymentMethod ? "outline" : "default"} size="sm">
                {view.paymentMethod ? t("billing.replaceCard") : t("billing.addCard")}
              </Button>
            </form>
          ) : null}
        </div>
      </section>

      {/* Invoice history */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">{t("billing.invoices")}</h2>
        {view.invoices.length === 0 ? (
          <div className="rounded-lg border p-6 text-sm text-muted-foreground">
            {t("billing.noInvoices")}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 text-xs text-muted-foreground">
                    {t("billing.invoiceDate")}
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground">
                    {t("billing.invoicePeriod")}
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground">
                    {t("billing.invoiceStatus")}
                  </TableHead>
                  <TableHead className="text-right text-xs text-muted-foreground">
                    {t("billing.invoiceAmount")}
                  </TableHead>
                  <TableHead className="w-0 px-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.invoices.map((invoice) => {
                  const variant = INVOICE_STATUS_VARIANT[invoice.status] ?? "outline";
                  const statusKey =
                    INVOICE_STATUS_KEY[invoice.status as keyof typeof INVOICE_STATUS_KEY];
                  return (
                    <TableRow key={invoice.id} className="hover:bg-muted/30">
                      <TableCell className="px-4">
                        <Link
                          href={`/dashboard/org/${orgSlug}/billing/${invoice.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {fmtDate(invoice.paidAt ?? invoice.billingPeriodStart)}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                        {t("billing.periodRange", {
                          start: fmtDate(invoice.billingPeriodStart),
                          end: fmtDate(invoice.billingPeriodEnd),
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={variant}>
                          {statusKey ? t(statusKey) : invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatMinorAmount(invoice.amountDueMinor, invoice.currency)}
                      </TableCell>
                      <TableCell className="px-4">
                        <Link
                          href={`/dashboard/org/${orgSlug}/billing/${invoice.id}`}
                          aria-label={t("billing.invoiceNumber")}
                        >
                          <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
