import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrgAccess } from "@/lib/org-access";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { loadPlatformInvoice } from "@/lib/platform-billing-view";
import { getPayT } from "@/lib/locales/server";
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

/**
 * Invoice detail — the itemisation, and the evidence behind it.
 *
 * The usage line's numbers are read from the snapshot written at period close,
 * never recomputed. A late webhook that flips one more payment_intent to
 * succeeded must not move a figure the merchant has already paid; if it did,
 * nobody could explain the discrepancy afterwards.
 *
 * The successful-charge count is shown deliberately: it is the handle a
 * merchant uses to reconcile our bill against their own records.
 */

type Params = Promise<{ orgSlug: string; invoiceId: string }>;

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

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default async function InvoiceDetailPage({ params }: { params: Params }) {
  const { orgSlug, invoiceId } = await params;
  const org = await requireOrgAccess(orgSlug);
  const t = await getPayT();

  const admin = createAdminSupabase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detail = await loadPlatformInvoice(admin as any, org.orgId, invoiceId);
  // An invoice id belonging to another merchant is a 404, not a 403 — the same
  // rule the org router follows, for the same reason.
  if (!detail) notFound();

  const { invoice, lines } = detail;

  /**
   * Rebuild a line's sentence in the merchant's language from the frozen
   * snapshot. The stored `description` is the audit record — English, written
   * once at close — and rendering it verbatim would put an English line inside
   * a Russian invoice. Both are derived from the same immutable numbers, so
   * they can never disagree; if the snapshot is somehow absent (a line written
   * before this metadata existed) the stored text is the fallback.
   */
  const describeLine = (line: (typeof lines)[number]) => {
    const meta = line.metadata;
    if (line.kind === "base") {
      const planName = meta.plan_name ?? detail.planName;
      return planName ? t("billing.line.base", { plan: String(planName) }) : line.description;
    }
    if (typeof meta.rate_bps !== "number") return line.description;
    return t(meta.capped === true ? "billing.line.usageCapped" : "billing.line.usage", {
      rate: meta.rate_bps / 100,
      volume: formatMinorAmount(Number(meta.base_minor ?? 0), invoice.currency),
      count: Number(meta.successful_charges ?? 0),
    });
  };

  const variant = INVOICE_STATUS_VARIANT[invoice.status] ?? "outline";
  const statusKey = INVOICE_STATUS_KEY[invoice.status as keyof typeof INVOICE_STATUS_KEY];
  const usageLine = lines.find((line) => line.kind === "usage");
  const usageMeta = usageLine?.metadata ?? {};

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/dashboard/org/${orgSlug}/billing`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {t("billing.backToBilling")}
        </Link>

        <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
              {formatMinorAmount(invoice.amountDueMinor, invoice.currency)}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="font-mono text-xs">{invoice.id}</span>
              <span>
                {t("billing.periodRange", {
                  start: fmtDate(invoice.billingPeriodStart),
                  end: fmtDate(invoice.billingPeriodEnd),
                })}
              </span>
            </p>
          </div>
          <Badge variant={variant}>{statusKey ? t(statusKey) : invoice.status}</Badge>
        </header>
      </div>

      {invoice.zeroAmount ? (
        <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {t("billing.zeroAmount")}
        </p>
      ) : null}

      {lines.length === 0 ? (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          {t("billing.noLines")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="px-4 text-xs text-muted-foreground">
                  {t("billing.lineDescription")}
                </TableHead>
                <TableHead className="text-right text-xs text-muted-foreground">
                  {t("billing.lineQty")}
                </TableHead>
                <TableHead className="text-right text-xs text-muted-foreground">
                  {t("billing.lineUnit")}
                </TableHead>
                <TableHead className="px-4 text-right text-xs text-muted-foreground">
                  {t("billing.lineAmount")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id} className="hover:bg-transparent">
                  <TableCell className="px-4">{describeLine(line)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {line.quantity}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {formatMinorAmount(line.unitAmountMinor, invoice.currency)}
                  </TableCell>
                  <TableCell className="px-4 text-right font-mono tabular-nums">
                    {formatMinorAmount(line.amountMinor, invoice.currency)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell className="px-4 font-medium">{t("billing.total")}</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="px-4 text-right font-mono font-semibold tabular-nums">
                  {formatMinorAmount(invoice.amountDueMinor, invoice.currency)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {/* The reconciliation handle: exactly what we metered, over exactly which
          window. Without the charge count a merchant can only agree or disagree
          with our total; with it they can check it. */}
      {usageLine ? (
        <p className="max-w-2xl text-xs text-muted-foreground">
          {t("billing.meteredOn", {
            count: Number(usageMeta.successful_charges ?? 0),
            volume: formatMinorAmount(Number(usageMeta.base_minor ?? 0), invoice.currency),
            start: fmtDate(String(usageMeta.usage_period_start ?? "")),
            end: fmtDate(String(usageMeta.usage_period_end ?? "")),
          })}
        </p>
      ) : null}
    </div>
  );
}
