import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { createUzumRecurringCharge, extractUzumChargeProviderRefs } from "./providers/uzum";
import { createAtmosRecurringCharge, extractAtmosChargeProviderRefs } from "./providers/atmos";
import type { AtmosCardDetails } from "./providers/atmos";
import { redactSensitive } from "./redact";
import { writePaymentLog } from "./debug-log";
import { emitSubscriptionEvent } from "./webhooks-out";

const RETRY_SCHEDULE_DAYS = [3, 7, 14] as const;

/**
 * Invoice statuses a customer-initiated recovery (dashboard "retry payment", or
 * re-running checkout) is allowed to charge against.
 *
 * `uncollectible` matters as much as `open`: when automatic dunning exhausts,
 * markPaymentFailed flips the invoice to `uncollectible` AND the subscription to
 * `past_due` in the same write. That `uncollectible` sentinel is what stops the
 * renewal cron from re-charging a dead card forever — but it must NOT hide the
 * invoice from the manual recovery paths, or a past_due merchant is stranded on
 * Free with no button that works. So the manual paths accept both; the cron
 * paths keep filtering to `open` only.
 */
export const RETRYABLE_INVOICE_STATUSES = ["open", "uncollectible"] as const;

/**
 * Pick the invoice a manual retry/resume should charge: the most recent one
 * (callers pass newest-first) that both carries a payment intent and sits in a
 * customer-recoverable status. Returns null when nothing is recoverable.
 */
export function pickRetryTargetInvoice<
  T extends { payment_intent_id?: string | null; status?: string | null },
>(invoices: T[]): T | null {
  return (
    invoices.find(
      (invoice) =>
        !!invoice.payment_intent_id &&
        (RETRYABLE_INVOICE_STATUSES as readonly string[]).includes(invoice.status ?? ""),
    ) ?? null
  );
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("hex");
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function pickBindingId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const rec = payload as Record<string, unknown>;

  const direct =
    (typeof rec.bindingId === "string" && rec.bindingId) ||
    (typeof rec.binding_id === "string" && rec.binding_id) ||
    null;
  if (direct) return direct;

  const result = rec.result;
  if (result && typeof result === "object") {
    const nested = result as Record<string, unknown>;
    if (typeof nested.bindingId === "string" && nested.bindingId) {
      return nested.bindingId;
    }
    if (typeof nested.binding_id === "string" && nested.binding_id) {
      return nested.binding_id;
    }
  }

  return null;
}

function pickRetryDueAt(attemptCount: number, firstFailedAt: Date): string | null {
  if (attemptCount >= 4) return null;
  const dayOffset = RETRY_SCHEDULE_DAYS[Math.max(0, attemptCount - 1)];
  return addDays(firstFailedAt, dayOffset).toISOString();
}

function hasUzumCartMetadata(metadata: Record<string, unknown>) {
  if (metadata.uzumCart && typeof metadata.uzumCart === "object") return true;
  const uzum = metadata.uzum;
  if (uzum && typeof uzum === "object") {
    const uz = uzum as Record<string, unknown>;
    if (uz.cart && typeof uz.cart === "object") return true;
  }
  return false;
}

function normalizeSpic(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePackageCode(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeVatPercent(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

type TaxIdentityType = "TIN" | "PINFL";
type FiscalTaxIdentity = {
  type: TaxIdentityType;
  value: string;
};

function normalizeTaxIdentityType(value: unknown): TaxIdentityType | null {
  if (value === "TIN" || value === "PINFL") return value;
  return null;
}

function normalizeTaxIdentityValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getPlanFiscalSpic(metadata: Record<string, unknown>) {
  const direct = normalizeSpic(metadata.spic);
  if (direct) return direct;

  const fiscalization = metadata.fiscalization;
  if (fiscalization && typeof fiscalization === "object") {
    const nested = fiscalization as Record<string, unknown>;
    const nestedSpic = normalizeSpic(nested.spic);
    if (nestedSpic) return nestedSpic;
  }

  return null;
}

function getPlanFiscalPackageCode(metadata: Record<string, unknown>) {
  const direct = normalizePackageCode(
    metadata.packageCode ?? metadata.package_code,
  );
  if (direct) return direct;

  const fiscalization = metadata.fiscalization;
  if (fiscalization && typeof fiscalization === "object") {
    const nested = fiscalization as Record<string, unknown>;
    const nestedPackageCode = normalizePackageCode(
      nested.packageCode ?? nested.package_code,
    );
    if (nestedPackageCode) return nestedPackageCode;
  }

  return null;
}

function getPlanFiscalVatPercent(metadata: Record<string, unknown>) {
  const direct = normalizeVatPercent(metadata.vatPercent ?? metadata.vat_percent);
  if (direct !== null) return direct;

  const fiscalization = metadata.fiscalization;
  if (fiscalization && typeof fiscalization === "object") {
    const nested = fiscalization as Record<string, unknown>;
    const nestedVatPercent = normalizeVatPercent(
      nested.vatPercent ?? nested.vat_percent,
    );
    if (nestedVatPercent !== null) return nestedVatPercent;
  }

  return null;
}

function getUzumCartFromMetadata(metadata: Record<string, unknown>) {
  if (metadata.uzumCart && typeof metadata.uzumCart === "object") {
    return metadata.uzumCart;
  }
  const uzum = metadata.uzum;
  if (uzum && typeof uzum === "object") {
    const uz = uzum as Record<string, unknown>;
    if (uz.cart && typeof uz.cart === "object") {
      return uz.cart;
    }
  }
  return null;
}

function getTaxIdentityFromFiscalizationObject(
  fiscalization: Record<string, unknown>,
): FiscalTaxIdentity | null {
  if (
    fiscalization.taxIdentity &&
    typeof fiscalization.taxIdentity === "object" &&
    !Array.isArray(fiscalization.taxIdentity)
  ) {
    const taxIdentity = fiscalization.taxIdentity as Record<string, unknown>;
    const type = normalizeTaxIdentityType(taxIdentity.type);
    const value = normalizeTaxIdentityValue(taxIdentity.value);
    if (type && value) {
      return { type, value };
    }
  }

  const tin = normalizeTaxIdentityValue(fiscalization.TIN ?? fiscalization.tin);
  if (tin) {
    return { type: "TIN", value: tin };
  }

  const pinfl = normalizeTaxIdentityValue(
    fiscalization.PINFL ?? fiscalization.pinfl,
  );
  if (pinfl) {
    return { type: "PINFL", value: pinfl };
  }

  return null;
}

function getOrgUzumFiscalization(metadata: unknown): {
  country: string | null;
  schema: string | null;
  taxIdentity: FiscalTaxIdentity | null;
} {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { country: null, schema: null, taxIdentity: null };
  }
  const record = metadata as Record<string, unknown>;

  if (
    record.fiscalization &&
    typeof record.fiscalization === "object" &&
    !Array.isArray(record.fiscalization)
  ) {
    const fiscalization = record.fiscalization as Record<string, unknown>;
    const country =
      typeof fiscalization.country === "string" ? fiscalization.country : null;
    const schema =
      typeof fiscalization.schema === "string" ? fiscalization.schema : null;
    const taxIdentity = getTaxIdentityFromFiscalizationObject(fiscalization);
    return { country, schema, taxIdentity };
  }

  return { country: null, schema: null, taxIdentity: null };
}

function getTaxIdentityFromEnv(): FiscalTaxIdentity | null {
  const tin = normalizeTaxIdentityValue(process.env.KRAFTA_PAY_FISCAL_TIN);
  if (tin) return { type: "TIN", value: tin };

  const pinfl = normalizeTaxIdentityValue(process.env.KRAFTA_PAY_FISCAL_PINFL);
  if (pinfl) return { type: "PINFL", value: pinfl };

  return null;
}

async function resolveOrgUzumFiscalization(
  supabase: SupabaseClient,
  orgId: string,
  environment: PayEnvironment,
) {
  const { data, error } = await supabase
    .schema("payments")
    .from("org_provider_accounts")
    .select("metadata")
    .eq("org_id", orgId)
    .eq("provider_id", "uzum")
    .eq("environment", environment)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw error;

  const metadata = Array.isArray(data) && data.length > 0 ? data[0]?.metadata : null;
  return getOrgUzumFiscalization(metadata);
}

async function resolveOrgTaxProfile(
  supabase: SupabaseClient,
  orgId: string,
  environment: PayEnvironment = defaultPayEnvironment(),
) {
  const db = supabase as any;
  const { data: profile, error: profileErr } = await db
    .schema("payments")
    .from("org_tax_profiles")
    .select("country_iso2, schema_id, tax_identity_type, tax_identity_value")
    .eq("org_id", orgId)
    .maybeSingle();
  if (profileErr && profileErr.code !== "PGRST205") throw profileErr;

  if (profile) {
    let schemaCode: string | null = null;
    if (profile.schema_id) {
      const { data: schema, error: schemaErr } = await db
        .schema("payments")
        .from("tax_schemas")
        .select("code")
        .eq("id", profile.schema_id)
        .maybeSingle();
      if (schemaErr && schemaErr.code !== "PGRST205") throw schemaErr;
      schemaCode = typeof schema?.code === "string" ? schema.code : null;
    }

    const type = normalizeTaxIdentityType(profile.tax_identity_type);
    const value = normalizeTaxIdentityValue(profile.tax_identity_value);
    return {
      country: typeof profile.country_iso2 === "string" ? profile.country_iso2 : null,
      schema: schemaCode,
      taxIdentity: type && value ? ({ type, value } as FiscalTaxIdentity) : null,
    };
  }

  return resolveOrgUzumFiscalization(supabase, orgId, environment);
}

async function resolvePlanTaxClassification(
  supabase: SupabaseClient,
  planId: string,
) {
  const db = supabase as any;
  const { data: classification, error: classificationErr } = await db
    .schema("payments")
    .from("plan_tax_classifications")
    .select("schema_id, tax_code_entry_id, tax_code, package_code, vat_percent")
    .eq("plan_id", planId)
    .maybeSingle();
  if (classificationErr && classificationErr.code !== "PGRST205") {
    throw classificationErr;
  }
  if (!classification) return null;

  let schemaCode: string | null = null;
  if (classification.schema_id) {
    const { data: schema, error: schemaErr } = await db
      .schema("payments")
      .from("tax_schemas")
      .select("code")
      .eq("id", classification.schema_id)
      .maybeSingle();
    if (schemaErr && schemaErr.code !== "PGRST205") throw schemaErr;
    schemaCode = typeof schema?.code === "string" ? schema.code : null;
  }

  let taxCode = normalizeSpic(classification.tax_code);
  let packageCode = normalizePackageCode(classification.package_code);
  if ((!taxCode || !packageCode) && classification.tax_code_entry_id) {
    const { data: entry, error: entryErr } = await db
      .schema("payments")
      .from("tax_code_entries")
      .select("tax_code, package_code")
      .eq("id", classification.tax_code_entry_id)
      .maybeSingle();
    if (entryErr && entryErr.code !== "PGRST205") throw entryErr;
    taxCode = taxCode ?? normalizeSpic(entry?.tax_code);
    packageCode = packageCode ?? normalizePackageCode(entry?.package_code);
  }

  return {
    schemaCode,
    taxCode,
    packageCode,
    vatPercent: normalizeVatPercent(classification.vat_percent),
    taxCodeEntryId:
      typeof classification.tax_code_entry_id === "string"
        ? classification.tax_code_entry_id
        : null,
  };
}

function buildUzumCartFromFiscalization(params: {
  amountMinor: number;
  title: string;
  spic: string;
  packageCode: string;
  vatPercent?: number | null;
  taxIdentity: FiscalTaxIdentity;
}) {
  const vatPercentRaw = Number(process.env.KRAFTA_PAY_FISCAL_VAT_PERCENT ?? "0");
  const vatPercent = Number.isFinite(vatPercentRaw) ? vatPercentRaw : 0;
  const resolvedVatPercent =
    typeof params.vatPercent === "number" && Number.isFinite(params.vatPercent)
      ? params.vatPercent
      : vatPercent;

  return {
    cartId: `subscription-cart-${Date.now()}`,
    receiptType: "PURCHASE",
    total: params.amountMinor,
    items: [
      {
        title: params.title,
        productId: "subscription-plan",
        quantity: 1,
        unitPrice: params.amountMinor,
        total: params.amountMinor,
        receiptParams: {
          spic: params.spic,
          packageCode: params.packageCode,
          vatPercent: resolvedVatPercent,
          [params.taxIdentity.type]: params.taxIdentity.value,
        },
      },
    ],
  };
}

function buildDemoUzumCart(params: {
  amountMinor: number;
  title: string;
  taxIdentity?: FiscalTaxIdentity | null;
}) {
  const taxIdentity = params.taxIdentity ?? { type: "TIN" as const, value: "123456789" };

  return {
    cartId: `subscription-cart-${Date.now()}`,
    receiptType: "PURCHASE",
    total: params.amountMinor,
    items: [
      {
        title: params.title,
        productId: "subscription-plan",
        quantity: 1,
        unitPrice: params.amountMinor,
        total: params.amountMinor,
        receiptParams: {
          spic: "10305008003000000",
          packageCode: "1546532",
          vatPercent: 0,
          [taxIdentity.type]: taxIdentity.value,
        },
      },
    ],
  };
}

export type PayEnvironment = "test" | "live";

/**
 * Fallback environment for callers with no key context (dashboard payment
 * links, internal Krafta routes). Explicit `environment` on the input always
 * wins — API-keyed callers pass the environment their key carries.
 */
export function defaultPayEnvironment(): PayEnvironment {
  return process.env.PAY_ENV === "test" ? "test" : "live";
}

export type CreateSubscriptionCheckoutInput = {
  merchantOrgId: string;
  // The subscriber's org, for cross-org billing (Krafta billing one of its own
  // merchant orgs). null for every other merchant — their subscribers are not
  // Krafta organizations, so they identify them with `customerExternalId`.
  customerOrgId: string | null;
  // The merchant's own id for this subscriber (telegram user id, internal uuid,
  // student number — their choice). Unique per (org, environment) and the
  // identity key for any merchant that is not Krafta itself.
  //
  // Supplying it is what makes repeated checkout calls idempotent at the
  // customer level. Without either this or customerOrgId, every call creates a
  // fresh customer row — which is exactly the duplicate-subscription bug that
  // made the null-org path unusable.
  customerExternalId?: string | null;
  planId: string;
  payBaseUrl: string;
  environment?: PayEnvironment;
  successUrl?: string | null;
  cancelUrl?: string | null;
  returnUrl?: string | null;
  customer?: {
    email?: string;
    phone?: string;
    customerUserRef?: string;
  };
  metadata?: Record<string, unknown>;
};

export type CreateSubscriptionCheckoutResult = {
  subscriptionId: string;
  invoiceId: string;
  checkoutSessionId: string;
  paymentIntentId: string;
  publicToken: string;
  payUrl: string;
};

export function normalizeExternalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type ResolveCustomerInput = {
  merchantOrgId: string;
  environment: PayEnvironment;
  customerOrgId?: string | null;
  externalId?: string | null;
  email?: string | null;
  phone?: string | null;
  customerUserRef?: string | null;
};

/**
 * Find-or-create the `payments.customers` row for a checkout.
 *
 * Two identity keys, checked in priority order:
 *
 *   1. `externalId` — the merchant's own id for the subscriber. The identity
 *      key for every merchant that is not Krafta. Unique per
 *      (org_id, environment, external_id).
 *   2. `customerOrgId` (+ `customerUserRef`) — Krafta billing one of its own
 *      merchant organizations. Predates the external-id model, kept working
 *      unchanged.
 *
 * `identified` reports whether we can recognise this customer on a later call.
 * When it is false the caller must NOT attempt checkout resume: an anonymous
 * customer is a different person each time, so "resuming" would attach a
 * stranger to someone else's subscription.
 *
 * Non-identifying fields (email/phone) are refreshed on an existing match —
 * people change their email, and the value the merchant just sent is newer
 * than whatever we stored months ago.
 */
export async function resolveOrCreateCustomer(
  supabase: SupabaseClient,
  input: ResolveCustomerInput,
): Promise<{ customerId: string; identified: boolean; created: boolean }> {
  const externalId = normalizeExternalId(input.externalId);
  const email = input.email ?? null;
  const phone = input.phone ?? null;
  const customerUserRef = input.customerUserRef ?? null;

  const findExisting = async () => {
    if (externalId) {
      const { data, error } = await supabase
        .schema("payments")
        .from("customers")
        .select("id")
        .eq("org_id", input.merchantOrgId)
        .eq("environment", input.environment)
        .eq("external_id", externalId)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    }

    if (input.customerOrgId && customerUserRef) {
      const { data, error } = await supabase
        .schema("payments")
        .from("customers")
        .select("id")
        .eq("org_id", input.merchantOrgId)
        .eq("customer_org_id", input.customerOrgId)
        .eq("customer_user_ref", customerUserRef)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    }

    return null;
  };

  const existingId = await findExisting();
  if (existingId) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (email) patch.email = email;
    if (phone) patch.phone = phone;
    if (customerUserRef) patch.customer_user_ref = customerUserRef;
    const { error: patchErr } = await supabase
      .schema("payments")
      .from("customers")
      .update(patch)
      .eq("id", existingId);
    if (patchErr) throw patchErr;

    return { customerId: existingId, identified: true, created: false };
  }

  const { data: created, error: createErr } = await supabase
    .schema("payments")
    .from("customers")
    .insert({
      org_id: input.merchantOrgId,
      environment: input.environment,
      customer_org_id: input.customerOrgId ?? null,
      external_id: externalId,
      email,
      phone,
      customer_user_ref: customerUserRef,
      metadata: {},
    })
    .select("id")
    .single();

  if (createErr) {
    // Lost a race against a concurrent checkout for the same external id — the
    // partial unique index rejected the second insert. The winner's row is the
    // right answer, so read it back rather than surfacing a 500 to a merchant
    // who did nothing wrong.
    if (externalId && isUniqueViolation(createErr)) {
      const retryId = await findExisting();
      if (retryId) return { customerId: retryId, identified: true, created: false };
    }
    throw createErr;
  }

  return {
    customerId: created.id,
    identified: Boolean(externalId || (input.customerOrgId && customerUserRef)),
    created: true,
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: unknown }).code === "23505";
}

export async function createSubscriptionCheckout(
  supabase: SupabaseClient,
  input: CreateSubscriptionCheckoutInput,
): Promise<CreateSubscriptionCheckoutResult> {
  const environment = input.environment ?? defaultPayEnvironment();

  const { data: plan, error: planErr } = await supabase
    .schema("payments")
    .from("plans")
    .select("id, org_id, name, amount_minor, currency, interval_count, trial_days, is_active, metadata")
    .eq("id", input.planId)
    .eq("org_id", input.merchantOrgId)
    .maybeSingle();

  if (planErr) throw planErr;
  if (!plan) throw new Error("plan_not_found");
  if (!plan.is_active) throw new Error("plan_inactive");

  const metadata = { ...(input.metadata ?? {}) } as Record<string, unknown>;
  const planMetadata =
    plan.metadata && typeof plan.metadata === "object"
      ? (plan.metadata as Record<string, unknown>)
      : {};
  const orgFiscalization = await resolveOrgTaxProfile(
    supabase,
    input.merchantOrgId,
    environment,
  );
  const fallbackTaxIdentity = getTaxIdentityFromEnv();
  const planClassification = await resolvePlanTaxClassification(supabase, plan.id);

  // Merchant can store fiscal cart on plan metadata and it will be applied automatically.
  if (!hasUzumCartMetadata(metadata)) {
    const planUzumCart = getUzumCartFromMetadata(planMetadata);
    if (planUzumCart) {
      metadata.uzumCart = planUzumCart;
    }
  }

  if (!hasUzumCartMetadata(metadata)) {
    const planSpic = planClassification?.taxCode ?? getPlanFiscalSpic(planMetadata);
    if (planSpic) {
      const planPackageCode =
        planClassification?.packageCode ?? getPlanFiscalPackageCode(planMetadata);
      if (!planPackageCode) {
        throw new Error("plan_package_code_required_for_spic");
      }

      const taxIdentity = orgFiscalization.taxIdentity ?? fallbackTaxIdentity;
      if (!taxIdentity) {
        throw new Error("org_tax_identity_required_for_fiscalization");
      }

      metadata.uzumCart = buildUzumCartFromFiscalization({
        amountMinor: plan.amount_minor,
        title: plan.name ?? "Subscription plan",
        spic: planSpic,
        packageCode: planPackageCode,
        vatPercent:
          planClassification?.vatPercent ?? getPlanFiscalVatPercent(planMetadata),
        taxIdentity,
      });
      metadata.fiscalization = {
        country: orgFiscalization.country ?? "UZ",
        schema:
          planClassification?.schemaCode ??
          orgFiscalization.schema ??
          "UZ_AUTOFISCAL_V1",
        spic: planSpic,
        packageCode: planPackageCode,
        taxIdentity,
        taxCodeEntryId: planClassification?.taxCodeEntryId ?? null,
      };
    }
  }

  // Uzum test terminals with AUTOFISCALIZATION enabled require cart fiscal params.
  // Auto-attach a demo cart only in test env when merchant hasn't provided one.
  if (environment === "test" && !hasUzumCartMetadata(metadata)) {
    const demoTaxIdentity = orgFiscalization.taxIdentity ?? fallbackTaxIdentity;
    metadata.uzumCart = buildDemoUzumCart({
      amountMinor: plan.amount_minor,
      title: plan.name ?? "Subscription plan",
      taxIdentity: demoTaxIdentity,
    });
    if (demoTaxIdentity) {
      metadata.fiscalization = {
        country: orgFiscalization.country ?? "UZ",
        schema: orgFiscalization.schema ?? "UZ_AUTOFISCAL_V1",
        taxIdentity: demoTaxIdentity,
      };
    }
  }

  const externalId = normalizeExternalId(input.customerExternalId);
  const { customerId, identified } = await resolveOrCreateCustomer(supabase, {
    merchantOrgId: input.merchantOrgId,
    environment,
    customerOrgId: input.customerOrgId,
    externalId,
    email: input.customer?.email ?? null,
    phone: input.customer?.phone ?? null,
    customerUserRef: input.customer?.customerUserRef ?? null,
  });

  // Resume applies to any *identified* customer — one we can recognise on a
  // second call, whether by Krafta org or by the merchant's own external id.
  // An anonymous customer (neither key given) is a new person every time by
  // definition, so there is nothing to resume.
  const resumedCheckout = identified
    ? await tryResumeExistingSubscriptionCheckout(supabase, {
        merchantOrgId: input.merchantOrgId,
        customerOrgId: input.customerOrgId,
        customerId,
        planId: plan.id,
        payBaseUrl: input.payBaseUrl,
        successUrl: input.successUrl ?? null,
        cancelUrl: input.cancelUrl ?? null,
        returnUrl: input.returnUrl ?? null,
        metadata,
      })
    : null;
  if (resumedCheckout) {
    return resumedCheckout;
  }

  const now = new Date();
  const periodStart = now;
  const periodEnd = addMonths(periodStart, Math.max(1, plan.interval_count ?? 1));
  const clientSecret = randomToken(24);
  const publicToken = randomToken(18);

  const { data: subscription, error: subscriptionErr } = await supabase
    .schema("payments")
    .from("subscriptions")
    .insert({
      org_id: input.merchantOrgId,
      plan_id: plan.id,
      customer_id: customerId,
      status: "incomplete",
      environment,
      metadata: {
        billing_anchor: periodStart.toISOString(),
        trial_days: plan.trial_days ?? 0,
        customer_org_id: input.customerOrgId,
        ...(externalId ? { customer_external_id: externalId } : {}),
        // Per-catalog scope: one org account holds one sub per catalog. Carried
        // from the caller's metadata.catalog_id. Absent = legacy org-wide sub.
        ...(typeof metadata.catalog_id === "string" && metadata.catalog_id
          ? { catalog_id: metadata.catalog_id }
          : {}),
      },
    })
    .select("id, customer_id")
    .single();
  if (subscriptionErr) throw subscriptionErr;

  const { data: invoice, error: invoiceErr } = await supabase
    .schema("payments")
    .from("invoices")
    .insert({
      org_id: input.merchantOrgId,
      subscription_id: subscription.id,
      amount_due_minor: plan.amount_minor,
      currency: plan.currency,
      status: "open",
      billing_period_start: periodStart.toISOString(),
      billing_period_end: periodEnd.toISOString(),
      due_at: now.toISOString(),
      attempt_count: 0,
      metadata: {
        billing_reason: "subscription_create",
      },
    })
    .select("id")
    .single();
  if (invoiceErr) throw invoiceErr;

  const { data: intent, error: intentErr } = await supabase
    .schema("payments")
    .from("payment_intents")
    .insert({
      org_id: input.merchantOrgId,
      amount_minor: plan.amount_minor,
      currency: plan.currency,
      description: "Subscription checkout",
      status: "requires_action",
      environment,
      client_secret: clientSecret,
      return_url: input.returnUrl ?? input.successUrl ?? null,
      metadata: {
        subscription_id: subscription.id,
        invoice_id: invoice.id,
        billing_reason: "subscription_create",
        merchant_org_id: input.merchantOrgId,
        customer_org_id: input.customerOrgId,
        ...metadata,
      },
    })
    .select("id")
    .single();
  if (intentErr) throw intentErr;

  const { error: invoiceIntentErr } = await supabase
    .schema("payments")
    .from("invoices")
    .update({ payment_intent_id: intent.id })
    .eq("id", invoice.id);
  if (invoiceIntentErr) throw invoiceIntentErr;

  const { data: checkoutSession, error: checkoutSessionErr } = await supabase
    .schema("payments")
    .from("checkout_sessions")
    .insert({
      org_id: input.merchantOrgId,
      payment_intent_id: intent.id,
      customer_id: subscription.customer_id,
      public_token: publicToken,
      status: "open",
      environment,
      success_url: input.successUrl ?? null,
      cancel_url: input.cancelUrl ?? null,
      return_url: input.returnUrl ?? null,
      metadata: {
        subscription_id: subscription.id,
        invoice_id: invoice.id,
        billing_reason: "subscription_create",
        merchant_org_id: input.merchantOrgId,
        customer_org_id: input.customerOrgId,
        ...metadata,
      },
    })
    .select("id")
    .single();
  if (checkoutSessionErr) throw checkoutSessionErr;

  const payUrl = `${input.payBaseUrl.replace(/\/+$/, "")}/pay/${publicToken}`;

  await emitSubscriptionEvent(supabase, {
    eventType: "subscription.created",
    subscriptionId: subscription.id,
    orgId: input.merchantOrgId,
    environment,
    invoiceId: invoice.id,
    payUrl,
  });

  return {
    subscriptionId: subscription.id,
    invoiceId: invoice.id,
    checkoutSessionId: checkoutSession.id,
    paymentIntentId: intent.id,
    publicToken,
    payUrl,
  };
}

type ResumeSubscriptionCheckoutInput = {
  merchantOrgId: string;
  customerOrgId: string | null;
  customerId: string;
  planId: string;
  payBaseUrl: string;
  successUrl: string | null;
  cancelUrl: string | null;
  returnUrl: string | null;
  metadata: Record<string, unknown>;
};

async function tryResumeExistingSubscriptionCheckout(
  supabase: SupabaseClient,
  input: ResumeSubscriptionCheckoutInput,
): Promise<CreateSubscriptionCheckoutResult | null> {
  const { data: subscriptions, error: subscriptionErr } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select("id, customer_id, status")
    .eq("org_id", input.merchantOrgId)
    .eq("plan_id", input.planId)
    .eq("customer_id", input.customerId)
    .in("status", ["incomplete", "past_due"])
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);
  if (subscriptionErr) throw subscriptionErr;
  const nonReusableIntentStatuses = new Set(["succeeded", "canceled", "cancelled"]);
  for (const subscription of subscriptions ?? []) {
    const { data: invoice, error: invoiceErr } = await supabase
      .schema("payments")
      .from("invoices")
      .select("id, payment_intent_id, status")
      .eq("subscription_id", subscription.id)
      // Accept `uncollectible` too, not just `open`: a past_due subscription
      // (dunning exhausted) carries an `uncollectible` invoice, and this resume
      // path is explicitly meant to cover past_due (see the status filter above).
      // Filtering to `open` alone silently skipped it and forked a duplicate
      // subscription instead of resuming the existing one.
      .in("status", RETRYABLE_INVOICE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (invoiceErr) throw invoiceErr;
    if (!invoice?.payment_intent_id) continue;

    const { data: intent, error: intentErr } = await supabase
      .schema("payments")
      .from("payment_intents")
      .select("id, status, environment")
      .eq("id", invoice.payment_intent_id)
      .maybeSingle();
    if (intentErr) throw intentErr;
    if (!intent) continue;

    if (nonReusableIntentStatuses.has(String(intent.status ?? "").toLowerCase())) {
      continue;
    }

    const nowIso = new Date().toISOString();
    const { error: intentUpdateErr } = await supabase
      .schema("payments")
      .from("payment_intents")
      .update({
        return_url: input.returnUrl ?? input.successUrl ?? null,
        updated_at: nowIso,
      })
      .eq("id", intent.id);
    if (intentUpdateErr) throw intentUpdateErr;

    const publicToken = randomToken(18);
    const { data: checkoutSession, error: checkoutSessionErr } = await supabase
      .schema("payments")
      .from("checkout_sessions")
      .insert({
        org_id: input.merchantOrgId,
        payment_intent_id: intent.id,
        customer_id: subscription.customer_id,
        public_token: publicToken,
        status: "open",
        // Inherit from the intent being resumed, never from PAY_ENV — a resumed
        // test checkout must keep resolving the test provider account.
        environment: (intent as { environment?: string }).environment ?? defaultPayEnvironment(),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        return_url: input.returnUrl,
        metadata: {
          subscription_id: subscription.id,
          invoice_id: invoice.id,
          billing_reason: "subscription_resume",
          resumed: true,
          merchant_org_id: input.merchantOrgId,
          customer_org_id: input.customerOrgId,
          ...input.metadata,
        },
      })
      .select("id")
      .single();
    if (checkoutSessionErr) throw checkoutSessionErr;

    await supabase
      .schema("payments")
      .from("subscription_events")
      .insert({
        subscription_id: subscription.id,
        event_type: "checkout_resumed",
        payload: {
          invoice_id: invoice.id,
          payment_intent_id: intent.id,
          reason: "reused_non_terminal_subscription",
        },
      });

    return {
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      checkoutSessionId: checkoutSession.id,
      paymentIntentId: intent.id,
      publicToken,
      payUrl: `${input.payBaseUrl.replace(/\/+$/, "")}/pay/${publicToken}`,
    };
  }

  return null;
}

type FinalizePaymentInput = {
  paymentIntentId: string;
  providerId: string;
  providerPaymentId?: string | null;
  payload?: unknown;
  attemptId?: string | null;
};

type PersistBindingPaymentMethodInput = {
  paymentIntentId: string;
  providerId: string;
  bindingId: string;
  orgProviderAccountId: string;
  cardDetails?: AtmosCardDetails | null;
};

type PersistBindingPaymentMethodForCustomerInput = {
  customerId: string;
  providerId: string;
  bindingId: string;
  orgProviderAccountId: string;
  setDefaultForSubscriptionId?: string | null;
  cardDetails?: AtmosCardDetails | null;
};

export async function persistBindingPaymentMethodForCustomer(
  supabase: SupabaseClient,
  input: PersistBindingPaymentMethodForCustomerInput,
) {
  const { data: existingPaymentMethod, error: existingPaymentMethodErr } = await supabase
    .schema("payments")
    .from("payment_methods")
    .select("id")
    .eq("customer_id", input.customerId)
    .eq("org_provider_account_id", input.orgProviderAccountId)
    .eq("provider_id", input.providerId)
    .eq("provider_token", input.bindingId)
    .maybeSingle();
  if (existingPaymentMethodErr) throw existingPaymentMethodErr;

  let paymentMethodId = existingPaymentMethod?.id ?? null;
  let created = false;
  if (!paymentMethodId) {
    const { data: createdPaymentMethod, error: createPaymentMethodErr } = await supabase
      .schema("payments")
      .from("payment_methods")
      .insert({
        customer_id: input.customerId,
        org_provider_account_id: input.orgProviderAccountId,
        provider_id: input.providerId,
        provider_token: input.bindingId,
        type: "card_binding",
        status: "active",
        is_default: true,
        brand: input.cardDetails?.brand ?? null,
        last4: input.cardDetails?.last4 ?? null,
        exp_month: input.cardDetails?.expMonth ?? null,
        exp_year: input.cardDetails?.expYear ?? null,
        metadata: {
          source: `${input.providerId}_binding`,
        },
      })
      .select("id")
      .single();
    if (createPaymentMethodErr) throw createPaymentMethodErr;
    paymentMethodId = createdPaymentMethod.id;
    created = true;
  } else if (input.cardDetails) {
    // Re-binding a card already on file (same provider token): refresh the
    // stored brand/last4 + expiry. A card's expiry changes when the bank
    // reissues it, and a card first saved before these columns existed would
    // otherwise stay detail-less forever — which would also feed stale expiry
    // to the proactive card-expiry warning.
    const { error: refreshErr } = await supabase
      .schema("payments")
      .from("payment_methods")
      .update({
        brand: input.cardDetails.brand ?? null,
        last4: input.cardDetails.last4 ?? null,
        exp_month: input.cardDetails.expMonth ?? null,
        exp_year: input.cardDetails.expYear ?? null,
      })
      .eq("id", paymentMethodId);
    if (refreshErr) throw refreshErr;
  }

  let setAsDefault = false;
  let subscriptionId = input.setDefaultForSubscriptionId ?? null;
  if (input.setDefaultForSubscriptionId) {
    const { data: subscription, error: subscriptionErr } = await supabase
      .schema("payments")
      .from("subscriptions")
      .select("id, customer_id, default_payment_method_id")
      .eq("id", input.setDefaultForSubscriptionId)
      .eq("customer_id", input.customerId)
      .maybeSingle();
    if (subscriptionErr) throw subscriptionErr;
    if (subscription) {
      subscriptionId = subscription.id;
      setAsDefault = subscription.default_payment_method_id !== paymentMethodId;
      if (setAsDefault) {
        const { error: setDefaultErr } = await supabase
          .schema("payments")
          .from("subscriptions")
          .update({
            default_payment_method_id: paymentMethodId,
          })
          .eq("id", subscription.id);
        if (setDefaultErr) throw setDefaultErr;
      }
    } else {
      subscriptionId = null;
    }
  }

  // A payment method is only ever inserted with is_default:true (above) or
  // promoted here because it just became a subscription's default — in both
  // cases every OTHER payment_methods row for this customer must flip to
  // is_default:false in the same atomic statement, or two rows can end up
  // is_default:true at once (they did, in production, before this fix).
  if (created || setAsDefault) {
    const { error: setDefaultFlagErr } = await supabase
      .schema("payments")
      .rpc("set_default_payment_method", {
        p_customer_id: input.customerId,
        p_payment_method_id: paymentMethodId,
      });
    if (setDefaultFlagErr) throw setDefaultFlagErr;
  }

  return {
    saved: true as const,
    created,
    paymentMethodId,
    customerId: input.customerId,
    subscriptionId,
    setAsDefault,
  };
}

export async function persistBindingPaymentMethodForPaymentIntent(
  supabase: SupabaseClient,
  input: PersistBindingPaymentMethodInput,
) {
  const { data: invoice, error: invoiceErr } = await supabase
    .schema("payments")
    .from("invoices")
    .select("subscription_id")
    .eq("payment_intent_id", input.paymentIntentId)
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (invoiceErr) throw invoiceErr;
  if (!invoice?.subscription_id) {
    return { saved: false as const, reason: "subscription_not_found_for_payment_intent" as const };
  }

  const { data: subscription, error: subscriptionErr } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select("id, customer_id, default_payment_method_id")
    .eq("id", invoice.subscription_id)
    .maybeSingle();
  if (subscriptionErr) throw subscriptionErr;
  if (!subscription?.customer_id) {
    return { saved: false as const, reason: "subscription_customer_missing" as const };
  }

  const persistResult = await persistBindingPaymentMethodForCustomer(supabase, {
    customerId: subscription.customer_id,
    providerId: input.providerId,
    bindingId: input.bindingId,
    orgProviderAccountId: input.orgProviderAccountId,
    setDefaultForSubscriptionId: subscription.id,
    cardDetails: input.cardDetails,
  });

  return {
    saved: true as const,
    created: persistResult.created,
    paymentMethodId: persistResult.paymentMethodId,
    subscriptionId: subscription.id,
    customerId: subscription.customer_id,
    setAsDefault: persistResult.setAsDefault,
  };
}

type CompleteStandaloneCheckoutInput = {
  paymentIntentId: string;
  providerId: string;
  providerPaymentId?: string | null;
  attemptId?: string | null;
  payload?: unknown;
};

export async function completeStandaloneCheckoutSession(
  supabase: SupabaseClient,
  input: CompleteStandaloneCheckoutInput,
) {
  const nowIso = new Date().toISOString();
  let attemptId = input.attemptId ?? null;

  if (!attemptId) {
    const { data: latestAttempt, error: attemptErr } = await supabase
      .schema("payments")
      .from("payment_attempts")
      .select("id")
      .eq("payment_intent_id", input.paymentIntentId)
      .eq("provider_id", input.providerId)
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (attemptErr) throw attemptErr;
    attemptId = latestAttempt?.id ?? null;
  }

  if (attemptId) {
    const { error: attemptUpdateErr } = await supabase
      .schema("payments")
      .from("payment_attempts")
      .update({
        status: "succeeded",
        provider_payment_id: input.providerPaymentId ?? null,
        updated_at: nowIso,
      })
      .eq("id", attemptId);
    if (attemptUpdateErr) throw attemptUpdateErr;
  }

  const { error: intentUpdateErr } = await supabase
    .schema("payments")
    .from("payment_intents")
    .update({ status: "succeeded", updated_at: nowIso })
    .eq("id", input.paymentIntentId);
  if (intentUpdateErr) throw intentUpdateErr;

  const { error: sessionUpdateErr } = await supabase
    .schema("payments")
    .from("checkout_sessions")
    .update({ status: "completed", updated_at: nowIso })
    .eq("payment_intent_id", input.paymentIntentId);
  if (sessionUpdateErr) throw sessionUpdateErr;

  return { paymentIntentId: input.paymentIntentId, attemptId };
}

export async function markStandaloneCheckoutFailed(
  supabase: SupabaseClient,
  input: MarkFailedInput & { attemptId?: string | null },
) {
  const nowIso = new Date().toISOString();
  const attemptId = input.attemptId ?? null;

  if (attemptId) {
    const { error: attemptUpdateErr } = await supabase
      .schema("payments")
      .from("payment_attempts")
      .update({
        status: "failed",
        provider_payment_id: input.providerPaymentId ?? null,
        updated_at: nowIso,
      })
      .eq("id", attemptId);
    if (attemptUpdateErr) throw attemptUpdateErr;
  }

  const { error: intentUpdateErr } = await supabase
    .schema("payments")
    .from("payment_intents")
    .update({
      status: "failed",
      updated_at: nowIso,
    })
    .eq("id", input.paymentIntentId);
  if (intentUpdateErr) throw intentUpdateErr;

  const { error: sessionUpdateErr } = await supabase
    .schema("payments")
    .from("checkout_sessions")
    .update({
      status: "failed",
      updated_at: nowIso,
    })
    .eq("payment_intent_id", input.paymentIntentId);
  if (sessionUpdateErr) throw sessionUpdateErr;
}

export async function finalizeInitialPayment(
  supabase: SupabaseClient,
  input: FinalizePaymentInput,
) {
  const nowIso = new Date().toISOString();
  const { data: intent, error: intentErr } = await supabase
    .schema("payments")
    .from("payment_intents")
    .select("id, status, metadata, amount_minor, currency")
    .eq("id", input.paymentIntentId)
    .maybeSingle();
  if (intentErr) throw intentErr;
  if (!intent) throw new Error("payment_intent_not_found");

  const metadata = (intent.metadata ?? {}) as Record<string, unknown>;
  const invoiceIdFromMetadata =
    typeof metadata.invoice_id === "string" ? metadata.invoice_id : null;
  const subscriptionIdFromMetadata =
    typeof metadata.subscription_id === "string" ? metadata.subscription_id : null;

  const { data: invoice, error: invoiceErr } = await supabase
    .schema("payments")
    .from("invoices")
    .select("id, subscription_id, billing_period_start, billing_period_end, attempt_count, metadata")
    .eq("payment_intent_id", intent.id)
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (invoiceErr) throw invoiceErr;

  const invoiceId = invoiceIdFromMetadata ?? invoice?.id ?? null;
  const subscriptionId = subscriptionIdFromMetadata ?? invoice?.subscription_id ?? null;
  // A subscription charge carries both an invoice and a subscription; a one-off
  // payment-link / hosted-checkout charge carries neither. A successful charge
  // must finalize the intent in BOTH cases — we must never leave the intent
  // 'processing' (and surface an error) after the money has actually moved.

  // Idempotency: if this intent was already finalized (e.g. a synchronous inline
  // apply succeeded and a late provider webhook arrives for the same charge), do
  // not re-run side effects — no duplicate subscription_events, no period reset.
  if (intent.status === "succeeded") {
    return { subscriptionId, invoiceId, paymentIntentId: intent.id };
  }

  let attempt: {
    id: string;
    org_provider_account_id: string;
  } | null = null;

  if (input.attemptId) {
    const { data: explicitAttempt, error: explicitAttemptErr } = await supabase
      .schema("payments")
      .from("payment_attempts")
      .select("id, org_provider_account_id")
      .eq("id", input.attemptId)
      .maybeSingle();
    if (explicitAttemptErr) throw explicitAttemptErr;
    attempt = explicitAttempt ?? null;
  }

  if (!attempt) {
    const { data: latestAttempt, error: attemptErr } = await supabase
      .schema("payments")
      .from("payment_attempts")
      .select("id, org_provider_account_id")
      .eq("payment_intent_id", intent.id)
      .eq("provider_id", input.providerId)
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (attemptErr) throw attemptErr;
    attempt = latestAttempt ?? null;
  }

  if (attempt) {
    const { error: attemptUpdateErr } = await supabase
      .schema("payments")
      .from("payment_attempts")
      .update({
        status: "succeeded",
        provider_payment_id: input.providerPaymentId ?? null,
      })
      .eq("id", attempt.id);
    if (attemptUpdateErr) throw attemptUpdateErr;
  }

  const { error: intentUpdateErr } = await supabase
    .schema("payments")
    .from("payment_intents")
    .update({ status: "succeeded" })
    .eq("id", intent.id);
  if (intentUpdateErr) throw intentUpdateErr;

  const { error: checkoutUpdateErr } = await supabase
    .schema("payments")
    .from("checkout_sessions")
    .update({ status: "completed" })
    .eq("payment_intent_id", intent.id);
  if (checkoutUpdateErr) throw checkoutUpdateErr;

  // One-off / payment-link charge: there is no subscription or invoice to
  // settle. The intent + checkout are finalized and the charge is recorded — we
  // are done (and crucially we did NOT throw after the money moved).
  if (!invoiceId || !subscriptionId) {
    return { subscriptionId: null, invoiceId: null, paymentIntentId: intent.id };
  }

  const { error: invoiceUpdateErr } = await supabase
    .schema("payments")
    .from("invoices")
    .update({
      status: "paid",
      paid_at: nowIso,
      attempt_count: Math.max(1, invoice?.attempt_count ?? 0),
      due_at: null,
    })
    .eq("id", invoiceId);
  if (invoiceUpdateErr) throw invoiceUpdateErr;

  const { data: subscription, error: subscriptionErr } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select("id, customer_id, org_id, default_payment_method_id, status, environment")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (subscriptionErr) throw subscriptionErr;
  if (!subscription) throw new Error("subscription_not_found");

  // Capture the status BEFORE we flip it to active — it is what distinguishes a
  // first activation from a dunning recovery, and the merchant cares about the
  // difference (one grants access, the other un-suspends it).
  const statusBeforeCharge = String(subscription.status ?? "");

  const periodStart = invoice?.billing_period_start ?? nowIso;
  const periodEnd = invoice?.billing_period_end ?? addMonths(new Date(), 1).toISOString();

  const { error: subscriptionUpdateErr } = await supabase
    .schema("payments")
    .from("subscriptions")
    .update({
      status: "active",
      current_period_start: periodStart,
      current_period_end: periodEnd,
      updated_at: nowIso,
    })
    .eq("id", subscription.id);
  if (subscriptionUpdateErr) throw subscriptionUpdateErr;

  const bindingId = pickBindingId(input.payload);
  if (bindingId && attempt?.org_provider_account_id) {
    await persistBindingPaymentMethodForPaymentIntent(supabase, {
      paymentIntentId: intent.id,
      providerId: input.providerId,
      bindingId,
      orgProviderAccountId: attempt.org_provider_account_id,
    });
  }

  await supabase
    .schema("payments")
    .from("subscription_events")
    .insert({
      subscription_id: subscription.id,
      event_type: "payment_succeeded",
      payload: {
        payment_intent_id: intent.id,
        provider_id: input.providerId,
        provider_payment_id: input.providerPaymentId ?? null,
      },
    });

  // One code path settles all three, so the prior status is what tells the
  // merchant which of them just happened:
  //   incomplete      -> first payment landed. Grant access.
  //   past_due/unpaid -> dunning worked. Un-suspend. This is the recovery the
  //                      whole product exists to produce.
  //   active/trialing -> an ordinary renewal. Extend the period.
  await emitSubscriptionEvent(supabase, {
    eventType:
      statusBeforeCharge === "past_due" || statusBeforeCharge === "unpaid"
        ? "subscription.recovered"
        : statusBeforeCharge === "active" || statusBeforeCharge === "trialing"
          ? "subscription.renewed"
          : "subscription.activated",
    subscriptionId: subscription.id,
    orgId: subscription.org_id,
    environment:
      (subscription as { environment?: string }).environment === "test" ? "test" : "live",
    invoiceId,
    extra: {
      previousStatus: statusBeforeCharge,
      providerId: input.providerId,
    },
  });

  return {
    subscriptionId: subscription.id,
    invoiceId,
    paymentIntentId: intent.id,
  };
}

type MarkFailedInput = {
  paymentIntentId: string;
  providerId: string;
  providerPaymentId?: string | null;
  payload?: unknown;
};

/**
 * Mint a fresh hosted checkout session over an already-failed payment intent so
 * the customer can retry with a *different* card.
 *
 * This is what makes `subscription.payment_failed` actionable rather than
 * merely informative. The dominant failure on Uzcard/Humo debit is an expired
 * card or an empty balance — re-charging the same saved token recovers the
 * second case but never the first. A link the customer can open and pay from
 * recovers both.
 *
 * `selectProviderCreateAttempt` gates on the SESSION being open, not on the
 * intent status, so a new open session over a failed intent is payable as-is.
 *
 * Returns null rather than throwing: this runs inside failure handling, and a
 * missing PAY_BASE_URL must not turn a recorded decline into an exception.
 */
export async function createRecoveryCheckoutSession(
  supabase: SupabaseClient,
  params: {
    paymentIntentId: string;
    orgId: string;
    customerId?: string | null;
    subscriptionId?: string | null;
    invoiceId?: string | null;
    environment: PayEnvironment;
    payBaseUrl?: string | null;
  },
): Promise<{ publicToken: string; payUrl: string } | null> {
  const payBaseUrl = params.payBaseUrl ?? process.env.PAY_BASE_URL ?? null;
  if (!payBaseUrl) return null;

  try {
    // Reuse an open session for this intent if one already exists — a customer
    // who got a link on attempt 1 should not need a different one on attempt 2,
    // and stale links in a Telegram history should keep working.
    const { data: existing } = await supabase
      .schema("payments")
      .from("checkout_sessions")
      .select("public_token")
      .eq("payment_intent_id", params.paymentIntentId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.public_token) {
      const token = String(existing.public_token);
      return { publicToken: token, payUrl: `${payBaseUrl.replace(/\/+$/, "")}/pay/${token}` };
    }

    const publicToken = randomToken(18);
    const { error } = await supabase
      .schema("payments")
      .from("checkout_sessions")
      .insert({
        org_id: params.orgId,
        payment_intent_id: params.paymentIntentId,
        customer_id: params.customerId ?? null,
        public_token: publicToken,
        status: "open",
        environment: params.environment,
        metadata: {
          billing_reason: "payment_recovery",
          subscription_id: params.subscriptionId ?? null,
          invoice_id: params.invoiceId ?? null,
        },
      });
    if (error) throw error;

    return {
      publicToken,
      payUrl: `${payBaseUrl.replace(/\/+$/, "")}/pay/${publicToken}`,
    };
  } catch (error) {
    await writePaymentLog(supabase, {
      type: "webhook_out",
      event: "recovery_link_failed",
      level: "warn",
      orgId: params.orgId,
      paymentIntentId: params.paymentIntentId,
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return null;
  }
}

export async function markPaymentFailed(
  supabase: SupabaseClient,
  input: MarkFailedInput,
) {
  const now = new Date();
  const nowIso = now.toISOString();
  const { data: invoice, error: invoiceErr } = await supabase
    .schema("payments")
    .from("invoices")
    .select("id, subscription_id, attempt_count, metadata")
    .eq("payment_intent_id", input.paymentIntentId)
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (invoiceErr) throw invoiceErr;
  if (!invoice) return;

  const nextAttemptCount = (invoice.attempt_count ?? 0) + 1;
  const invoiceMetadata = ((invoice.metadata ?? {}) as Record<string, unknown>);
  const firstFailedAtValue =
    typeof invoiceMetadata.first_failed_at === "string"
      ? invoiceMetadata.first_failed_at
      : nowIso;
  const firstFailedAt = new Date(firstFailedAtValue);
  const dueAt = pickRetryDueAt(nextAttemptCount, firstFailedAt);
  const isExpired = nextAttemptCount >= 4;

  const { error: intentUpdateErr } = await supabase
    .schema("payments")
    .from("payment_intents")
    .update({
      status: "failed",
      updated_at: nowIso,
    })
    .eq("id", input.paymentIntentId);
  if (intentUpdateErr) throw intentUpdateErr;

  const { error: invoiceUpdateErr } = await supabase
    .schema("payments")
    .from("invoices")
    .update({
      status: isExpired ? "uncollectible" : "open",
      attempt_count: nextAttemptCount,
      due_at: dueAt,
      metadata: {
        ...invoiceMetadata,
        first_failed_at: firstFailedAt.toISOString(),
      },
      updated_at: nowIso,
    })
    .eq("id", invoice.id);
  if (invoiceUpdateErr) throw invoiceUpdateErr;

  const { data: subscription, error: subscriptionErr } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select("id, status, org_id, customer_id, environment")
    .eq("id", invoice.subscription_id)
    .maybeSingle();
  if (subscriptionErr) throw subscriptionErr;

  if (subscription) {
    const nextStatus =
      isExpired && subscription.status === "incomplete"
        ? "incomplete_expired"
        : isExpired
          ? "past_due"
          : subscription.status;

    if (nextStatus !== subscription.status) {
      const { error: subscriptionUpdateErr } = await supabase
        .schema("payments")
        .from("subscriptions")
        .update({
          status: nextStatus,
          updated_at: nowIso,
        })
        .eq("id", subscription.id);
      if (subscriptionUpdateErr) throw subscriptionUpdateErr;
    }

    await supabase
      .schema("payments")
      .from("subscription_events")
      .insert({
        subscription_id: subscription.id,
        event_type: "payment_failed",
        payload: {
          payment_intent_id: input.paymentIntentId,
          provider_id: input.providerId,
          provider_payment_id: input.providerPaymentId ?? null,
          attempt_count: nextAttemptCount,
          next_due_at: dueAt,
        },
      });

    const environment: PayEnvironment =
      (subscription as { environment?: string }).environment === "test" ? "test" : "live";

    const recovery = await createRecoveryCheckoutSession(supabase, {
      paymentIntentId: input.paymentIntentId,
      orgId: subscription.org_id,
      customerId: subscription.customer_id,
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      environment,
    });

    await emitSubscriptionEvent(supabase, {
      eventType: "subscription.payment_failed",
      subscriptionId: subscription.id,
      orgId: subscription.org_id,
      environment,
      invoiceId: invoice.id,
      payUrl: recovery?.payUrl ?? null,
      extra: {
        providerId: input.providerId,
        attemptCount: nextAttemptCount,
        // null once automatic dunning is exhausted — the signal for a merchant
        // to escalate (downgrade, suspend, or ask a human to call).
        nextRetryAt: dueAt,
        dunningExhausted: isExpired,
      },
    });
  }
}

/**
 * Shared post-charge activation, used by BOTH the Uzum webhook (after
 * createUzumRecurringCharge) and, in Phase 1, the Atmos inline apply route
 * (after a synchronous atmosApply). The provider-specific charge happens in the
 * caller; this function only records the outcome and drives the subscription
 * state machine, so both providers produce identical transitions.
 *
 * The card binding/token must already be persisted by the caller BEFORE the
 * charge (so a saved card survives a failed first charge for retry/renewal);
 * this function does not persist it.
 */
export async function activateSubscriptionAfterCharge(
  supabase: SupabaseClient,
  input: {
    paymentIntentId: string;
    providerId: string;
    attemptId: string;
    chargeStatus: "succeeded" | "processing" | "failed";
    providerPaymentId?: string | null;
    // Provider bookkeeping persisted on the attempt; redacted before write so a
    // raw provider body can never leak a PAN/OTP/token into raw_init_response.
    attemptRawResponse?: Record<string, unknown>;
    // Passed to finalizeInitialPayment on success (used there for binding
    // extraction + audit). Callers must pass a payload safe to persist: Uzum
    // passes its webhook payload; Atmos passes a minimal allowlisted object.
    finalizePayload?: unknown;
    // Passed to markPaymentFailed on failure (audit only).
    failurePayload?: unknown;
  },
) {
  const nowIso = new Date().toISOString();
  const attemptStatus =
    input.chargeStatus === "succeeded"
      ? "succeeded"
      : input.chargeStatus === "processing"
        ? "processing"
        : "failed";

  const { error: attemptUpdateErr } = await supabase
    .schema("payments")
    .from("payment_attempts")
    .update({
      status: attemptStatus,
      provider_payment_id: input.providerPaymentId ?? null,
      raw_init_response: redactSensitive(input.attemptRawResponse ?? {}),
      updated_at: nowIso,
    })
    .eq("id", input.attemptId);
  if (attemptUpdateErr) throw attemptUpdateErr;

  if (input.chargeStatus === "succeeded") {
    await finalizeInitialPayment(supabase, {
      paymentIntentId: input.paymentIntentId,
      providerId: input.providerId,
      providerPaymentId: input.providerPaymentId ?? null,
      payload: input.finalizePayload,
      attemptId: input.attemptId,
    });
  } else if (input.chargeStatus === "failed") {
    await markPaymentFailed(supabase, {
      paymentIntentId: input.paymentIntentId,
      providerId: input.providerId,
      providerPaymentId: input.providerPaymentId ?? null,
      payload: input.failurePayload,
    });
  } else {
    const { error: intentProcessingErr } = await supabase
      .schema("payments")
      .from("payment_intents")
      .update({ status: "processing", updated_at: nowIso })
      .eq("id", input.paymentIntentId);
    if (intentProcessingErr) throw intentProcessingErr;
  }
}

async function ensureRenewalInvoice(
  supabase: SupabaseClient,
  params: {
    subscriptionId: string;
    orgId: string;
    amountMinor: number;
    currency: string;
    periodStartIso: string;
    periodEndIso: string;
    environment: PayEnvironment;
  },
) {
  const { data: existingInvoice, error: existingInvoiceErr } = await supabase
    .schema("payments")
    .from("invoices")
    .select("id, payment_intent_id, status, due_at")
    .eq("subscription_id", params.subscriptionId)
    .eq("billing_period_start", params.periodStartIso)
    .eq("billing_period_end", params.periodEndIso)
    .maybeSingle();
  if (existingInvoiceErr) throw existingInvoiceErr;
  if (existingInvoice?.payment_intent_id) {
    return {
      invoiceId: existingInvoice.id,
      paymentIntentId: existingInvoice.payment_intent_id,
      created: false,
      status: (existingInvoice.status as string | null) ?? "open",
      dueAt: (existingInvoice.due_at as string | null) ?? null,
    };
  }

  const { data: invoice, error: invoiceErr } = await supabase
    .schema("payments")
    .from("invoices")
    .insert({
      org_id: params.orgId,
      subscription_id: params.subscriptionId,
      amount_due_minor: params.amountMinor,
      currency: params.currency,
      status: "open",
      billing_period_start: params.periodStartIso,
      billing_period_end: params.periodEndIso,
      due_at: new Date().toISOString(),
      metadata: {
        billing_reason: "subscription_cycle",
      },
    })
    .select("id")
    .single();
  if (invoiceErr) throw invoiceErr;

  // Create the intent in a PRE-charge state, not 'processing'. chargeRenewal
  // flips it to 'processing' via a conditional update (compare-and-swap) as a
  // single-flight lock right before it moves money, so 'processing' must mean
  // "a charge is in flight" and nothing else. (Same contract the inline apply
  // route and the manual retry route rely on.) 'requires_payment_method' is the
  // column default and the natural pre-charge state for an off-session renewal.
  const { data: intent, error: intentErr } = await supabase
    .schema("payments")
    .from("payment_intents")
    .insert({
      org_id: params.orgId,
      amount_minor: params.amountMinor,
      currency: params.currency,
      environment: params.environment,
      status: "requires_payment_method",
      client_secret: randomToken(24),
      metadata: {
        subscription_id: params.subscriptionId,
        invoice_id: invoice.id,
        billing_reason: "subscription_cycle",
      },
    })
    .select("id")
    .single();
  if (intentErr) throw intentErr;

  const { error: invoiceUpdateErr } = await supabase
    .schema("payments")
    .from("invoices")
    .update({
      payment_intent_id: intent.id,
    })
    .eq("id", invoice.id);
  if (invoiceUpdateErr) throw invoiceUpdateErr;

  return {
    invoiceId: invoice.id,
    paymentIntentId: intent.id,
    created: true,
    status: "open" as string,
    dueAt: null as string | null,
  };
}

export async function chargeRenewal(
  supabase: SupabaseClient,
  params: {
    subscriptionId: string;
  },
) {
  const now = new Date();
  const { data: subscription, error: subscriptionErr } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select(
      "id, org_id, status, customer_id, plan_id, default_payment_method_id, current_period_end, cancel_at_period_end, environment, metadata",
    )
    .eq("id", params.subscriptionId)
    .maybeSingle();
  if (subscriptionErr) throw subscriptionErr;
  if (!subscription) throw new Error("subscription_not_found");
  if (subscription.status !== "active" && subscription.status !== "past_due") {
    return { skipped: true, reason: "subscription_not_chargeable" as const };
  }

  const environment: PayEnvironment =
    (subscription as { environment?: string }).environment === "test" ? "test" : "live";

  const periodStart = subscription.current_period_end
    ? new Date(subscription.current_period_end)
    : now;

  if (subscription.cancel_at_period_end && periodStart <= now) {
    const { error: cancelErr } = await supabase
      .schema("payments")
      .from("subscriptions")
      .update({
        status: "canceled",
        canceled_at: now.toISOString(),
      })
      .eq("id", subscription.id);
    if (cancelErr) throw cancelErr;

    await supabase
      .schema("payments")
      .from("subscription_events")
      .insert({
        subscription_id: subscription.id,
        event_type: "canceled",
        payload: { source: "renewal_cycle", reason: "cancel_at_period_end" },
      });

    // The moment access should actually stop. A merchant who revoked on the
    // earlier "cancel scheduled" call would have cut the customer off while
    // they were still paid up; this is the event that means it for real.
    await emitSubscriptionEvent(supabase, {
      eventType: "subscription.canceled",
      subscriptionId: subscription.id,
      orgId: subscription.org_id,
      environment,
      extra: { immediate: false, source: "renewal_cycle" },
    });

    return { skipped: true, reason: "canceled_at_period_end" as const };
  }

  const subscriptionMetadata =
    subscription.metadata && typeof subscription.metadata === "object"
      ? ({ ...(subscription.metadata as Record<string, unknown>) } as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const pendingPlanChange =
    subscriptionMetadata.pending_plan_change &&
    typeof subscriptionMetadata.pending_plan_change === "object"
      ? (subscriptionMetadata.pending_plan_change as Record<string, unknown>)
      : null;
  const pendingPlanId =
    pendingPlanChange && typeof pendingPlanChange.plan_id === "string"
      ? pendingPlanChange.plan_id
      : null;
  const pendingEffectiveAt =
    pendingPlanChange && typeof pendingPlanChange.effective_at === "string"
      ? pendingPlanChange.effective_at
      : null;
  const effectivePlanId =
    pendingPlanId && pendingEffectiveAt === "period_end" ? pendingPlanId : subscription.plan_id;

  const { data: plan, error: planErr } = await supabase
    .schema("payments")
    .from("plans")
    .select("amount_minor, currency, interval_count, name, metadata")
    .eq("id", effectivePlanId)
    .maybeSingle();
  if (planErr) throw planErr;
  if (!plan) throw new Error("plan_not_found");

  const planMetadata =
    plan.metadata && typeof plan.metadata === "object"
      ? (plan.metadata as Record<string, unknown>)
      : {};
  let renewalUzumCart = getUzumCartFromMetadata(planMetadata);

  if (!renewalUzumCart) {
    const orgFiscalization = await resolveOrgTaxProfile(
      supabase,
      subscription.org_id,
      environment,
    );
    const fallbackTaxIdentity = getTaxIdentityFromEnv();
    const planClassification = await resolvePlanTaxClassification(
      supabase,
      effectivePlanId,
    );
    const planSpic = planClassification?.taxCode ?? getPlanFiscalSpic(planMetadata);
    const planPackageCode =
      planClassification?.packageCode ?? getPlanFiscalPackageCode(planMetadata);
    const taxIdentity = orgFiscalization.taxIdentity ?? fallbackTaxIdentity;

    if (planSpic && planPackageCode && taxIdentity) {
      renewalUzumCart = buildUzumCartFromFiscalization({
        amountMinor: plan.amount_minor,
        title: plan.name ?? "Subscription renewal",
        spic: planSpic,
        packageCode: planPackageCode,
        vatPercent:
          planClassification?.vatPercent ?? getPlanFiscalVatPercent(planMetadata),
        taxIdentity,
      });
    }
  }

  if (!renewalUzumCart && environment === "test") {
    const fallbackTaxIdentity = getTaxIdentityFromEnv();
    renewalUzumCart = buildDemoUzumCart({
      amountMinor: plan.amount_minor,
      title: plan.name ?? "Subscription renewal",
      taxIdentity: fallbackTaxIdentity,
    });
  }

  const periodStartIso = periodStart.toISOString();
  const periodEndIso = addMonths(
    periodStart,
    Math.max(1, plan.interval_count ?? 1),
  ).toISOString();
  const renewal = await ensureRenewalInvoice(supabase, {
    subscriptionId: subscription.id,
    orgId: subscription.org_id,
    amountMinor: plan.amount_minor,
    currency: plan.currency,
    periodStartIso,
    periodEndIso,
    environment,
  });

  // Respect the dunning schedule + terminal invoice states. The primary renewal
  // loop re-selects a subscription every cron tick while current_period_end
  // stays in the past (it only advances on success), so without these guards a
  // declined card would be re-charged every hour — collapsing the 3/7/14-day
  // dunning window to a few hours — and an exhausted (uncollectible) or already
  // paid invoice would be charged again forever. Only charge a freshly created
  // invoice, or an existing still-OPEN invoice whose due_at has arrived.
  if (!renewal.created) {
    if (renewal.status !== "open") {
      return { skipped: true, reason: "invoice_not_collectible" as const };
    }
    if (renewal.dueAt && new Date(renewal.dueAt) > now) {
      return { skipped: true, reason: "retry_not_due" as const };
    }
  }

  if (!subscription.default_payment_method_id) {
    await markPaymentFailed(supabase, {
      paymentIntentId: renewal.paymentIntentId,
      providerId: "uzum",
    });
    return { skipped: true, reason: "missing_default_payment_method" as const };
  }

  const { data: paymentMethod, error: paymentMethodErr } = await supabase
    .schema("payments")
    .from("payment_methods")
    .select("id, provider_id, org_provider_account_id, provider_token")
    .eq("id", subscription.default_payment_method_id)
    .maybeSingle();
  if (paymentMethodErr) throw paymentMethodErr;
  if (!paymentMethod) {
    await markPaymentFailed(supabase, {
      paymentIntentId: renewal.paymentIntentId,
      providerId: "uzum",
    });
    return { skipped: true, reason: "default_payment_method_not_found" as const };
  }
  // Providers that support off-session recurring charges. Phase 1 adds "atmos"
  // alongside a charge-fn dispatch below; payme/click remain unsupported.
  const RECURRING_PROVIDERS = new Set(["uzum", "atmos"]);
  if (!RECURRING_PROVIDERS.has(paymentMethod.provider_id)) {
    throw new Error("unsupported_recurring_provider");
  }
  // Attribute every renewal record to the saved card's actual provider rather
  // than a hardcoded "uzum", so an Atmos renewal is recorded as atmos in Phase 1.
  const renewalProviderId = paymentMethod.provider_id;

  const { data: customer, error: customerErr } = await supabase
    .schema("payments")
    .from("customers")
    .select("id, phone")
    .eq("id", subscription.customer_id)
    .maybeSingle();
  if (customerErr) throw customerErr;

  // Single-flight lock. The open+due guard above is NOT enough: two executions
  // can pass it at once on the same dunning invoice — the Vercel renewal cron
  // racing an internal renewal POST, an overrunning tick overlapping the next,
  // or the cron racing a dashboard Retry — and each would insert an attempt and
  // fire a REAL charge. `account` is an Atmos reconciliation reference, not an
  // idempotency key, so the provider does NOT dedup the second charge and the
  // merchant is billed twice for one period. Claim the intent by flipping it out
  // of a chargeable state (requires_payment_method for a fresh cycle invoice,
  // failed for a dunning retry) into 'processing' with a conditional update; only
  // the row that wins proceeds. Any concurrent execution finds it already
  // 'processing' (or succeeded/canceled), matches no row, and bails without
  // charging. This mirrors the manual retry route's failed->processing lock.
  const { data: claimedIntent, error: claimIntentErr } = await supabase
    .schema("payments")
    .from("payment_intents")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", renewal.paymentIntentId)
    .in("status", ["requires_payment_method", "failed"])
    .select("id")
    .maybeSingle();
  if (claimIntentErr) throw claimIntentErr;
  if (!claimedIntent) {
    return { skipped: true, reason: "charge_in_progress" as const };
  }

  const { data: attempt, error: attemptErr } = await supabase
    .schema("payments")
    .from("payment_attempts")
    .insert({
      payment_intent_id: renewal.paymentIntentId,
      provider_id: renewalProviderId,
      org_provider_account_id: paymentMethod.org_provider_account_id,
      status: "initialized",
      raw_init_response: {},
    })
    .select("id")
    .single();
  if (attemptErr) throw attemptErr;

  const chargeResult =
    renewalProviderId === "atmos"
      ? await createAtmosRecurringCharge({
          supabase,
          orgProviderAccountId: paymentMethod.org_provider_account_id,
          providerToken: paymentMethod.provider_token,
          amountMinor: plan.amount_minor,
          // Atmos reconciliation id; the renewal intent id is stable per cycle.
          account: renewal.paymentIntentId,
        })
      : await createUzumRecurringCharge({
          supabase,
          orgProviderAccountId: paymentMethod.org_provider_account_id,
          paymentIntentId: renewal.paymentIntentId,
          providerToken: paymentMethod.provider_token,
          clientId: customer?.id ?? subscription.org_id,
          description: "Subscription renewal",
          // Uzum register may be idempotent by orderNumber. Renewal retries create a
          // new payment_attempt, so use attempt id to force a fresh charge orderId.
          orderNumber: `renewal-${attempt.id}`,
          currency: plan.currency,
          amountMinor: plan.amount_minor,
          uzumCart: renewalUzumCart,
          phoneNumber: customer?.phone,
        });
  const providerRefs =
    renewalProviderId === "atmos"
      ? extractAtmosChargeProviderRefs(chargeResult.raw)
      : extractUzumChargeProviderRefs(chargeResult.raw);
  const chargeAttemptProviderPaymentId =
    chargeResult.providerPaymentId ??
    (renewalProviderId === "uzum"
      ? (providerRefs as { chargeOrderId?: string | null }).chargeOrderId ?? null
      : null);

  const { error: updateAttemptErr } = await supabase
    .schema("payments")
    .from("payment_attempts")
    .update({
      provider_payment_id: chargeAttemptProviderPaymentId,
      status:
        chargeResult.status === "succeeded"
          ? "succeeded"
          : chargeResult.status === "processing"
            ? "processing"
            : "failed",
      raw_init_response: redactSensitive({
        attemptKind: "renewal_off_session",
        ...(chargeResult.raw ?? {}),
        providerRefs,
      }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", attempt.id);
  if (updateAttemptErr) throw updateAttemptErr;

  if (chargeResult.status === "succeeded") {
    await finalizeInitialPayment(supabase, {
      paymentIntentId: renewal.paymentIntentId,
      providerId: renewalProviderId,
      providerPaymentId: chargeAttemptProviderPaymentId,
      attemptId: attempt.id,
    });

    if (effectivePlanId !== subscription.plan_id) {
      delete subscriptionMetadata.pending_plan_change;
      const nowIso = new Date().toISOString();
      const { error: subscriptionPlanUpdateErr } = await supabase
        .schema("payments")
        .from("subscriptions")
        .update({
          plan_id: effectivePlanId,
          metadata: subscriptionMetadata,
          updated_at: nowIso,
        })
        .eq("id", subscription.id);
      if (subscriptionPlanUpdateErr) throw subscriptionPlanUpdateErr;

      await supabase.schema("payments").from("subscription_events").insert({
        subscription_id: subscription.id,
        event_type: "scheduled_plan_change_applied",
        payload: {
          from_plan_id: subscription.plan_id,
          to_plan_id: effectivePlanId,
          payment_intent_id: renewal.paymentIntentId,
          source: "renewal_cycle",
        },
      });
    }

    return { skipped: false, paymentIntentId: renewal.paymentIntentId };
  }

  if (chargeResult.status === "failed") {
    await markPaymentFailed(supabase, {
      paymentIntentId: renewal.paymentIntentId,
      providerId: renewalProviderId,
      providerPaymentId: chargeAttemptProviderPaymentId,
      payload: chargeResult.raw,
    });
  } else {
    await supabase
      .schema("payments")
      .from("payment_intents")
      .update({
        status: "processing",
      })
      .eq("id", renewal.paymentIntentId);
  }

  return { skipped: false, paymentIntentId: renewal.paymentIntentId };
}

export async function runRenewalCycle(
  supabase: SupabaseClient,
  runAt = new Date(),
) {
  const runAtIso = runAt.toISOString();

  const { data: dueSubscriptions, error: dueSubscriptionsErr } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select("id")
    .in("status", ["active", "past_due"])
    .lte("current_period_end", runAtIso);
  if (dueSubscriptionsErr) throw dueSubscriptionsErr;

  let charged = 0;
  let canceled = 0;
  let errored = 0;
  // Subscriptions already handled by the primary loop below. The retry loop then
  // skips them: re-invoking chargeRenewal on a subscription the primary loop just
  // charged would, after finalize advances current_period_end, create a fresh
  // NEXT-period invoice and charge it prematurely (the retry snapshot still lists
  // the now-paid invoice). One pass per subscription per run.
  const handledSubscriptionIds = new Set<string>();
  for (const row of dueSubscriptions ?? []) {
    const { data: subscription, error: subscriptionErr } = await supabase
      .schema("payments")
      .from("subscriptions")
      .select("id, cancel_at_period_end")
      .eq("id", row.id)
      .maybeSingle();
    if (subscriptionErr) throw subscriptionErr;
    if (!subscription) continue;
    handledSubscriptionIds.add(subscription.id);

    if (subscription.cancel_at_period_end) {
      const { error: cancelErr } = await supabase
        .schema("payments")
        .from("subscriptions")
        .update({
          status: "canceled",
          canceled_at: runAtIso,
        })
        .eq("id", subscription.id);
      if (cancelErr) throw cancelErr;
      canceled += 1;
      continue;
    }

    // Per-subscription isolation: a single subscription whose charge throws
    // (e.g. Atmos create/pre-apply errors, a deleted plan) must NOT abort the
    // whole batch and starve every other due subscription. Record the failure
    // against just that subscription (so it backs off per the dunning schedule
    // instead of retrying every hour) and move on.
    try {
      await chargeRenewal(supabase, { subscriptionId: subscription.id });
      charged += 1;
    } catch {
      errored += 1;
      await markOpenInvoiceFailedBestEffort(supabase, subscription.id);
    }
  }

  const { data: retryInvoices, error: retryInvoicesErr } = await supabase
    .schema("payments")
    .from("invoices")
    .select("id, subscription_id")
    .eq("status", "open")
    .lte("due_at", runAtIso)
    .not("payment_intent_id", "is", null);
  if (retryInvoicesErr) throw retryInvoicesErr;

  let retried = 0;
  for (const invoice of retryInvoices ?? []) {
    // Already charged (or attempted) in the primary loop this run — skip to avoid
    // a second chargeRenewal on an already-advanced subscription.
    if (handledSubscriptionIds.has(invoice.subscription_id)) continue;
    handledSubscriptionIds.add(invoice.subscription_id);
    try {
      await chargeRenewal(supabase, { subscriptionId: invoice.subscription_id });
      retried += 1;
    } catch {
      errored += 1;
      await markOpenInvoiceFailedBestEffort(supabase, invoice.subscription_id);
    }
  }

  return {
    chargedSubscriptions: charged,
    canceledSubscriptions: canceled,
    retriedInvoices: retried,
    erroredSubscriptions: errored,
  };
}

/**
 * On a thrown renewal charge, push the subscription's current open invoice
 * through the normal failure path so it backs off per the 3/7/14-day schedule
 * instead of being retried every cron tick. Best-effort: never throws (the
 * caller is already in a catch handler and must keep processing the batch).
 */
async function markOpenInvoiceFailedBestEffort(
  supabase: SupabaseClient,
  subscriptionId: string,
): Promise<void> {
  try {
    const { data: invoice } = await supabase
      .schema("payments")
      .from("invoices")
      .select("payment_intent_id")
      .eq("subscription_id", subscriptionId)
      .eq("status", "open")
      .not("payment_intent_id", "is", null)
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (invoice?.payment_intent_id) {
      await markPaymentFailed(supabase, {
        paymentIntentId: String(invoice.payment_intent_id),
        providerId: "unknown",
      });
    }
  } catch {
    // swallow — batch processing must continue
  }
}
