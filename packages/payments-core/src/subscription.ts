import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { createUzumRecurringCharge, extractUzumChargeProviderRefs } from "./providers/uzum";

const RETRY_SCHEDULE_DAYS = [3, 7, 14] as const;

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
) {
  const environment = (process.env.PAY_ENV ?? "live") as "test" | "live";
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

  return resolveOrgUzumFiscalization(supabase, orgId);
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

export type CreateSubscriptionCheckoutInput = {
  merchantOrgId: string;
  customerOrgId: string;
  planId: string;
  payBaseUrl: string;
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

export async function createSubscriptionCheckout(
  supabase: SupabaseClient,
  input: CreateSubscriptionCheckoutInput,
): Promise<CreateSubscriptionCheckoutResult> {
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
  if ((process.env.PAY_ENV ?? "live") === "test" && !hasUzumCartMetadata(metadata)) {
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

  let customerId: string | null = null;
  if (input.customer?.customerUserRef) {
    const { data: existing, error: existingErr } = await supabase
      .schema("payments")
      .from("customers")
      .select("id")
      .eq("org_id", input.merchantOrgId)
      .eq("customer_org_id", input.customerOrgId)
      .eq("customer_user_ref", input.customer.customerUserRef)
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (existingErr) throw existingErr;
    customerId = existing?.id ?? null;
  }

  if (!customerId) {
    const { data: customer, error: customerErr } = await supabase
      .schema("payments")
      .from("customers")
      .insert({
        org_id: input.merchantOrgId,
        customer_org_id: input.customerOrgId,
        email: input.customer?.email ?? null,
        phone: input.customer?.phone ?? null,
        customer_user_ref: input.customer?.customerUserRef ?? null,
        metadata: {},
      })
      .select("id")
      .single();
    if (customerErr) throw customerErr;
    customerId = customer.id;
  }
  if (!customerId) throw new Error("customer_create_or_lookup_failed");

  const resumedCheckout = await tryResumeExistingSubscriptionCheckout(supabase, {
    merchantOrgId: input.merchantOrgId,
    customerOrgId: input.customerOrgId,
    customerId,
    planId: plan.id,
    payBaseUrl: input.payBaseUrl,
    successUrl: input.successUrl ?? null,
    cancelUrl: input.cancelUrl ?? null,
    returnUrl: input.returnUrl ?? null,
    metadata,
  });
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
      metadata: {
        billing_anchor: periodStart.toISOString(),
        trial_days: plan.trial_days ?? 0,
        customer_org_id: input.customerOrgId,
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

  return {
    subscriptionId: subscription.id,
    invoiceId: invoice.id,
    checkoutSessionId: checkoutSession.id,
    paymentIntentId: intent.id,
    publicToken,
    payUrl: `${input.payBaseUrl.replace(/\/+$/, "")}/pay/${publicToken}`,
  };
}

type ResumeSubscriptionCheckoutInput = {
  merchantOrgId: string;
  customerOrgId: string;
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
      .in("status", ["open"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (invoiceErr) throw invoiceErr;
    if (!invoice?.payment_intent_id) continue;

    const { data: intent, error: intentErr } = await supabase
      .schema("payments")
      .from("payment_intents")
      .select("id, status")
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
};

type PersistBindingPaymentMethodForCustomerInput = {
  customerId: string;
  providerId: string;
  bindingId: string;
  orgProviderAccountId: string;
  setDefaultForSubscriptionId?: string | null;
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
        metadata: {
          source: "uzum_binding",
        },
      })
      .select("id")
      .single();
    if (createPaymentMethodErr) throw createPaymentMethodErr;
    paymentMethodId = createdPaymentMethod.id;
    created = true;
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
    .select("id, metadata, amount_minor, currency")
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

  const invoiceId = invoiceIdFromMetadata ?? invoice?.id;
  const subscriptionId = subscriptionIdFromMetadata ?? invoice?.subscription_id;
  if (!invoiceId || !subscriptionId) {
    throw new Error("subscription_or_invoice_missing_for_payment_intent");
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

  const { error: checkoutUpdateErr } = await supabase
    .schema("payments")
    .from("checkout_sessions")
    .update({ status: "completed" })
    .eq("payment_intent_id", intent.id);
  if (checkoutUpdateErr) throw checkoutUpdateErr;

  const { data: subscription, error: subscriptionErr } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select("id, customer_id, org_id, default_payment_method_id")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (subscriptionErr) throw subscriptionErr;
  if (!subscription) throw new Error("subscription_not_found");

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
    .select("id, status")
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
  },
) {
  const { data: existingInvoice, error: existingInvoiceErr } = await supabase
    .schema("payments")
    .from("invoices")
    .select("id, payment_intent_id")
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

  const { data: intent, error: intentErr } = await supabase
    .schema("payments")
    .from("payment_intents")
    .insert({
      org_id: params.orgId,
      amount_minor: params.amountMinor,
      currency: params.currency,
      status: "processing",
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
      "id, org_id, status, customer_id, plan_id, default_payment_method_id, current_period_end, cancel_at_period_end, metadata",
    )
    .eq("id", params.subscriptionId)
    .maybeSingle();
  if (subscriptionErr) throw subscriptionErr;
  if (!subscription) throw new Error("subscription_not_found");
  if (subscription.status !== "active" && subscription.status !== "past_due") {
    return { skipped: true, reason: "subscription_not_chargeable" as const };
  }

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
    const orgFiscalization = await resolveOrgTaxProfile(supabase, subscription.org_id);
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

  if (!renewalUzumCart && (process.env.PAY_ENV ?? "live") === "test") {
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
  });

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
  if (paymentMethod.provider_id !== "uzum") {
    throw new Error("unsupported_recurring_provider");
  }

  const { data: customer, error: customerErr } = await supabase
    .schema("payments")
    .from("customers")
    .select("id, phone")
    .eq("id", subscription.customer_id)
    .maybeSingle();
  if (customerErr) throw customerErr;

  const { data: attempt, error: attemptErr } = await supabase
    .schema("payments")
    .from("payment_attempts")
    .insert({
      payment_intent_id: renewal.paymentIntentId,
      provider_id: "uzum",
      org_provider_account_id: paymentMethod.org_provider_account_id,
      status: "initialized",
      raw_init_response: {},
    })
    .select("id")
    .single();
  if (attemptErr) throw attemptErr;

  const chargeResult = await createUzumRecurringCharge({
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
  const uzumRefs = extractUzumChargeProviderRefs(chargeResult.raw);
  const chargeAttemptProviderPaymentId =
    chargeResult.providerPaymentId ?? uzumRefs.chargeOrderId ?? null;

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
      raw_init_response: {
        attemptKind: "renewal_off_session",
        ...(chargeResult.raw ?? {}),
        providerRefs: uzumRefs,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", attempt.id);
  if (updateAttemptErr) throw updateAttemptErr;

  if (chargeResult.status === "succeeded") {
    await finalizeInitialPayment(supabase, {
      paymentIntentId: renewal.paymentIntentId,
      providerId: "uzum",
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
      providerId: "uzum",
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
  for (const row of dueSubscriptions ?? []) {
    const { data: subscription, error: subscriptionErr } = await supabase
      .schema("payments")
      .from("subscriptions")
      .select("id, cancel_at_period_end")
      .eq("id", row.id)
      .maybeSingle();
    if (subscriptionErr) throw subscriptionErr;
    if (!subscription) continue;

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

    await chargeRenewal(supabase, { subscriptionId: subscription.id });
    charged += 1;
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
    await chargeRenewal(supabase, { subscriptionId: invoice.subscription_id });
    retried += 1;
  }

  return {
    chargedSubscriptions: charged,
    canceledSubscriptions: canceled,
    retriedInvoices: retried,
  };
}
