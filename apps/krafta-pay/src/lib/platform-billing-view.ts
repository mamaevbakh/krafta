import {
  computePlatformUsage,
  computeUsageFeeMinor,
  ensurePlatformSubscription,
  getPlatformBillingExemption,
  getPlatformSubscription,
  platformBillingEnvironment,
  platformPricingFromPlanRow,
  resolvePlatformOrgId,
  type PlatformPlanPricing,
} from "@krafta/payments-core";

/**
 * platform-billing-view.ts — everything the merchant's Billing page renders.
 *
 * One rule governs this file: the merchant must see the same number we bill on.
 * The usage figure here is computed with the identical query the period close
 * uses (`computePlatformUsage`), over the period currently open. If a merchant
 * cannot reproduce their invoice from this page, they will dispute it.
 */

export type PlatformPaymentMethod = {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  status: string;
};

export type PlatformInvoiceSummary = {
  id: string;
  status: string;
  amountDueMinor: number;
  currency: string;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  paidAt: string | null;
  dueAt: string | null;
  attemptCount: number;
  zeroAmount: boolean;
};

export type PlatformInvoiceLineRow = {
  id: string;
  kind: "base" | "usage";
  description: string;
  quantity: number;
  unitAmountMinor: number;
  amountMinor: number;
  metadata: Record<string, unknown>;
};

export type PlatformBillingView = {
  subscriptionId: string;
  status: string;
  planCode: string;
  planName: string;
  planAmountMinor: number;
  currency: string;
  features: Record<string, unknown>;
  pricing: PlatformPlanPricing;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  /** Volume processed so far in the open period, minor units. */
  usageBaseMinor: number;
  usageCharges: number;
  /** Usage fee accrued so far, minor units. */
  usageFeeMinor: number;
  usageCapped: boolean;
  /** What the next invoice comes to if the period closed right now. */
  estimatedNextInvoiceMinor: number;
  paymentMethod: PlatformPaymentMethod | null;
  invoices: PlatformInvoiceSummary[];
};

function toInvoiceSummary(row: Record<string, unknown>): PlatformInvoiceSummary {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    id: String(row.id),
    status: String(row.status ?? "open"),
    amountDueMinor: Number(row.amount_due_minor ?? 0),
    currency: String(row.currency ?? "UZS"),
    billingPeriodStart: (row.billing_period_start as string | null) ?? null,
    billingPeriodEnd: (row.billing_period_end as string | null) ?? null,
    paidAt: (row.paid_at as string | null) ?? null,
    dueAt: (row.due_at as string | null) ?? null,
    attemptCount: Number(row.attempt_count ?? 0),
    zeroAmount: metadata.zero_amount === true,
  };
}

/**
 * Load (and, on first visit, provision) a merchant's platform billing state.
 *
 * Provisioning here rather than at signup is deliberate: it is idempotent, it
 * cannot leave an org half-onboarded, and it means an org created before this
 * feature existed becomes billable the first time anyone opens the page.
 *
 * Returns null for the platform org itself — krafta-studio does not bill
 * krafta-studio, and rendering the page for it would invite exactly that.
 */
export async function loadPlatformBilling(
  admin: any,
  merchantOrgId: string,
): Promise<PlatformBillingView | null> {
  const platformOrgId = await resolvePlatformOrgId(admin);
  if (merchantOrgId === platformOrgId) return null;

  // Never provision an exempt org. The page renders an exempt state instead —
  // callers check the exemption first, and this is the guard that makes it safe
  // if one ever forgets.
  if (await getPlatformBillingExemption(admin, merchantOrgId)) return null;

  let record = await getPlatformSubscription(admin, merchantOrgId);
  if (!record) {
    await ensurePlatformSubscription(admin, { merchantOrgId });
    record = await getPlatformSubscription(admin, merchantOrgId);
  }
  if (!record) return null;

  const { subscription, plan } = record;
  const pricing = platformPricingFromPlanRow(plan as { code?: string; metadata?: unknown });

  const currentPeriodStart = (subscription.current_period_start as string | null) ?? null;
  const currentPeriodEnd = (subscription.current_period_end as string | null) ?? null;

  // Usage so far in the OPEN period — the same window, and the same query, that
  // the next period close will meter. Charges after `now` cannot exist, so the
  // upper bound is simply now.
  const usage = currentPeriodStart
    ? await computePlatformUsage(admin, {
        merchantOrgId,
        periodStart: currentPeriodStart,
        periodEnd: new Date().toISOString(),
      })
    : { baseMinor: 0, successfulCharges: 0 };

  const { feeMinor, capped } = computeUsageFeeMinor(usage.baseMinor, pricing);
  const planAmountMinor = Number(plan.amount_minor ?? 0);

  let paymentMethod: PlatformPaymentMethod | null = null;
  const defaultPaymentMethodId = subscription.default_payment_method_id as string | null;
  if (defaultPaymentMethodId) {
    const { data, error } = await admin
      .schema("payments")
      .from("payment_methods")
      .select("id, brand, last4, exp_month, exp_year, status")
      .eq("id", defaultPaymentMethodId)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      paymentMethod = {
        id: String(data.id),
        brand: data.brand ?? null,
        last4: data.last4 ?? null,
        expMonth: data.exp_month ?? null,
        expYear: data.exp_year ?? null,
        status: String(data.status ?? "active"),
      };
    }
  }

  const { data: invoiceRows, error: invoiceErr } = await admin
    .schema("payments")
    .from("invoices")
    .select(
      "id, status, amount_due_minor, currency, billing_period_start, billing_period_end, paid_at, due_at, attempt_count, metadata",
    )
    .eq("subscription_id", subscription.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (invoiceErr) throw invoiceErr;

  return {
    subscriptionId: String(subscription.id),
    status: String(subscription.status ?? "active"),
    planCode: String(plan.code ?? ""),
    planName: String(plan.name ?? ""),
    planAmountMinor,
    currency: String(plan.currency ?? "UZS"),
    features:
      plan.features && typeof plan.features === "object"
        ? (plan.features as Record<string, unknown>)
        : {},
    pricing,
    currentPeriodStart,
    currentPeriodEnd,
    usageBaseMinor: usage.baseMinor,
    usageCharges: usage.successfulCharges,
    usageFeeMinor: feeMinor,
    usageCapped: capped,
    estimatedNextInvoiceMinor: planAmountMinor + feeMinor,
    paymentMethod,
    invoices: ((invoiceRows ?? []) as Record<string, unknown>[]).map(toInvoiceSummary),
  };
}

export type PlatformInvoiceDetail = {
  invoice: PlatformInvoiceSummary;
  lines: PlatformInvoiceLineRow[];
  planName: string;
};

/**
 * One invoice with its itemisation, authorized against the merchant's own
 * platform subscription. Reading an invoice id that belongs to a different
 * merchant returns null rather than 403 — same enumeration rule the org router
 * follows.
 */
export async function loadPlatformInvoice(
  admin: any,
  merchantOrgId: string,
  invoiceId: string,
): Promise<PlatformInvoiceDetail | null> {
  const record = await getPlatformSubscription(admin, merchantOrgId);
  if (!record) return null;

  const { data: invoice, error: invoiceErr } = await admin
    .schema("payments")
    .from("invoices")
    .select(
      "id, status, amount_due_minor, currency, billing_period_start, billing_period_end, paid_at, due_at, attempt_count, metadata, subscription_id",
    )
    .eq("id", invoiceId)
    .eq("subscription_id", record.subscription.id)
    .maybeSingle();
  if (invoiceErr) throw invoiceErr;
  if (!invoice) return null;

  const { data: lines, error: linesErr } = await admin
    .schema("payments")
    .from("invoice_line_items")
    .select("id, kind, description, quantity, unit_amount_minor, amount_minor, metadata")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true });
  if (linesErr) throw linesErr;

  return {
    invoice: toInvoiceSummary(invoice as Record<string, unknown>),
    planName: String((record.plan as Record<string, unknown>).name ?? ""),
    lines: ((lines ?? []) as Record<string, unknown>[]).map((line) => ({
      id: String(line.id),
      kind: line.kind === "usage" ? "usage" : "base",
      description: String(line.description ?? ""),
      quantity: Number(line.quantity ?? 1),
      unitAmountMinor: Number(line.unit_amount_minor ?? 0),
      amountMinor: Number(line.amount_minor ?? 0),
      metadata:
        line.metadata && typeof line.metadata === "object"
          ? (line.metadata as Record<string, unknown>)
          : {},
    })),
  };
}

export { getPlatformBillingExemption, platformBillingEnvironment };
