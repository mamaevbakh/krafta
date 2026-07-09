function getPayBaseUrl() {
  return process.env.KRAFTA_PAY_URL ?? process.env.PAY_BASE_URL ?? "http://localhost:3001";
}

function getApiKey() {
  const apiKey = process.env.KRAFTA_PAY_API_KEY ?? process.env.BILLING_API_KEY;
  if (!apiKey) {
    throw new Error("missing_krafta_pay_api_key");
  }
  return apiKey;
}

export type CreatePaySubscriptionCheckoutInput = {
  customerOrgId: string;
  planId: string;
  /** The catalog this subscription is for — persisted on the sub for per-catalog billing. */
  catalogId?: string;
  successUrl: string;
  cancelUrl: string;
  returnUrl: string;
  customerRef: {
    email?: string;
    phone?: string;
    customerUserRef?: string;
  };
  catalogContext?: Record<string, unknown>;
  initiatedByUserId: string;
};

export type CreatePaySubscriptionCheckoutResult = {
  subscriptionId: string;
  invoiceId: string;
  checkoutSessionId: string;
  paymentIntentId: string;
  publicToken: string;
  payUrl: string;
};

export type CreateCustomerPortalSessionInput = {
  customerOrgId: string;
  returnUrl: string;
  customerUserRef?: string;
  flowData?: {
    type?: "payment_method_update" | "subscription_cancel" | "subscription_update";
    subscriptionId?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
};

export type CreateCustomerPortalSessionResult = {
  id: string;
  object: "customer_portal.session";
  url: string;
  expiresAt: string;
};

export type KraftaPayPlan = {
  id: string;
  name: string;
  code: string;
  amount_minor: number;
  currency: string;
  interval_count: number;
  trial_days: number;
  is_active: boolean;
};

export async function listKraftaPayPlans(): Promise<KraftaPayPlan[]> {
  const apiKey = getApiKey();
  const baseUrl = getPayBaseUrl().replace(/\/+$/, "");
  const res = await fetch(`${baseUrl}/api/v1/plans`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as
    | { plans?: KraftaPayPlan[]; error?: string }
    | null;
  if (!res.ok || !json || json.error || !Array.isArray(json.plans)) {
    throw new Error(json?.error ?? `pay_plans_http_${res.status}`);
  }
  return json.plans;
}

export async function createPaySubscriptionCheckout(
  input: CreatePaySubscriptionCheckoutInput,
): Promise<CreatePaySubscriptionCheckoutResult> {
  const payload = JSON.stringify(input);
  const apiKey = getApiKey();
  const baseUrl = getPayBaseUrl().replace(/\/+$/, "");

  const res = await fetch(`${baseUrl}/api/v1/subscriptions/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: payload,
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as
    | CreatePaySubscriptionCheckoutResult
    | { error?: string }
    | null;
  if (!res.ok || !json || ("error" in json && json.error)) {
    throw new Error((json as { error?: string } | null)?.error ?? `pay_checkout_http_${res.status}`);
  }

  return json as CreatePaySubscriptionCheckoutResult;
}

export async function createKraftaPayCustomerPortalSession(
  input: CreateCustomerPortalSessionInput,
): Promise<CreateCustomerPortalSessionResult> {
  const payload = JSON.stringify(input);
  const apiKey = getApiKey();
  const baseUrl = getPayBaseUrl().replace(/\/+$/, "");

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1/customer_portal/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: payload,
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch_failed";
    const causeCode =
      error && typeof error === "object" && "cause" in error
        ? String((error as any).cause?.code ?? "")
        : "";
    throw new Error(
      `pay_customer_portal_fetch_failed${causeCode ? `:${causeCode}` : ""}:${message}`,
    );
  }

  const json = (await res.json().catch(() => null)) as
    | CreateCustomerPortalSessionResult
    | { error?: string }
    | null;
  if (!res.ok || !json || ("error" in json && json.error)) {
    throw new Error((json as { error?: string } | null)?.error ?? `pay_customer_portal_http_${res.status}`);
  }

  return json as CreateCustomerPortalSessionResult;
}
