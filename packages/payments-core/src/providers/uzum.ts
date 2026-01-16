import type { ProviderAttemptResult } from "./index";

import { getCheckoutSessionByPublicToken, getOrgProviderAccountSecrets, getPaymentIntentById } from "../db";

type UzumCredentials = {
  apiBaseUrl: string;
  terminalId: string;
  apiKey: string;
  contentLanguage?: "ru-RU" | "uz-UZ" | "en-EN";
};

function assertString(v: unknown, name: string): asserts v is string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`${name}_is_required`);
  }
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function uzumCurrencyCode(currency: string): number {
  const c = currency.trim().toUpperCase();
  if (c === "UZS" || c === "860") return 860;
  throw new Error(`uzum_unsupported_currency:${currency}`);
}

function pickOrderNumber(intentId: string, orderId: string | null) {
  if (orderId && orderId.length >= 1 && orderId.length <= 36) return orderId;
  return intentId;
}

function pickReturnUrl(session: {
  success_url: string | null;
  cancel_url: string | null;
  return_url: string | null;
}, payBaseUrl: string, publicToken: string) {
  const fallback = `${payBaseUrl.replace(/\/+$/, "")}/pay/${publicToken}`;

  const pickHttps = (...candidates: Array<string | null | undefined>) =>
    candidates.find((u) => typeof u === "string" && u.startsWith("https://")) ?? null;

  const successUrl = pickHttps(session.success_url, session.return_url, fallback);
  const failureUrl = pickHttps(session.cancel_url, session.return_url, fallback);

  if (!successUrl || !failureUrl) {
    throw new Error("uzum_requires_https_success_and_failure_urls");
  }

  return { successUrl, failureUrl };
}

function getUzumCartFromMetadata(metadata: unknown): unknown | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;

  // Accept either { uzumCart: {...} } or { uzum: { cart: {...} } }
  if (m.uzumCart && typeof m.uzumCart === "object") return m.uzumCart;
  if (m.uzum && typeof m.uzum === "object") {
    const uz = m.uzum as Record<string, unknown>;
    if (uz.cart && typeof uz.cart === "object") return uz.cart;
  }

  return null;
}

function parseUzumCredentials(credentials: unknown): UzumCredentials {
  if (!credentials || typeof credentials !== "object") {
    throw new Error("uzum_credentials_invalid");
  }

  const rec = credentials as Record<string, unknown>;

  const apiBaseUrl = rec.apiBaseUrl;
  const terminalId = rec.terminalId;
  const apiKey = rec.apiKey;
  const contentLanguage = rec.contentLanguage;

  assertString(apiBaseUrl, "uzum_apiBaseUrl");
  assertString(terminalId, "uzum_terminalId");
  assertString(apiKey, "uzum_apiKey");

  return {
    apiBaseUrl,
    terminalId,
    apiKey,
    contentLanguage: (contentLanguage as UzumCredentials["contentLanguage"]) ?? undefined,
  };
}

type CreateAttemptCtx = {
  supabase: any;
  providerId: string;
  orgProviderAccountId: string;
  environment: "test" | "live";
  paymentIntentId: string;
  paymentAttemptId: string;
  publicToken: string;
  payBaseUrl: string;
};

export async function createUzumAttempt(ctx: CreateAttemptCtx): Promise<ProviderAttemptResult> {
  // Load session + intent
  const session = await getCheckoutSessionByPublicToken(ctx.supabase, ctx.publicToken);
  const intent = await getPaymentIntentById(ctx.supabase, ctx.paymentIntentId);

  // Load credentials (stored as JSON; naming includes "encrypted" but the decrypt step is handled elsewhere)
  const secrets = await getOrgProviderAccountSecrets(ctx.supabase, ctx.orgProviderAccountId);
  const creds = parseUzumCredentials(secrets.credentials_encrypted);

  const apiBaseUrl = normalizeBaseUrl(creds.apiBaseUrl);
  const { successUrl, failureUrl } = pickReturnUrl(session, ctx.payBaseUrl, ctx.publicToken);

  const url = `${apiBaseUrl}/api/v1/payment/register`;

  const cart = getUzumCartFromMetadata(session.metadata);
  const body = {
    amount: intent.amount_minor,
    clientId: session.customer_id ?? session.org_id,
    currency: uzumCurrencyCode(intent.currency),
    paymentDetails: intent.description ?? "Payment",
    orderNumber: pickOrderNumber(intent.id, intent.order_id),
    viewType: "REDIRECT",
    sessionTimeoutSecs: 1800,
    successUrl,
    failureUrl,
    ...(cart ? { merchantParams: { cart } } : {}),
    paymentParams: {
      payType: "ONE_STEP",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Language": creds.contentLanguage ?? "ru-RU",
      "X-Terminal-Id": creds.terminalId,
      "X-API-Key": creds.apiKey,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as any;

  if (!res.ok) {
    throw new Error(`uzum_register_http_${res.status}`);
  }

  if (!json || typeof json !== "object") {
    throw new Error("uzum_register_invalid_response");
  }

  const errorCode = Number(json.errorCode ?? 0);
  if (errorCode !== 0) {
    const message = typeof json.message === "string" ? json.message : "Uzum error";
    throw new Error(`uzum_register_error:${errorCode}:${message}`);
  }

  const result = json.result ?? {};
  const providerPaymentId = typeof result.orderId === "string" ? result.orderId : undefined;
  const redirectUrl = typeof result.paymentRedirectUrl === "string" ? result.paymentRedirectUrl : undefined;
  if (!redirectUrl) {
    throw new Error("uzum_missing_redirect_url");
  }

  return {
    redirectUrl,
    providerPaymentId,
    status: "requires_action",
    raw: { request: body, response: json, environment: ctx.environment },
  };
}
