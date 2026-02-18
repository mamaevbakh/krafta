import type { ProviderAttemptResult } from "./index";
import crypto from "crypto";

import { getCheckoutSessionByPublicToken, getOrgProviderAccountSecrets, getPaymentIntentById } from "../db";
import { decryptSecretJsonMaybe } from "../secrets";

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
  const decrypted = decryptSecretJsonMaybe(credentials);
  if (!decrypted || typeof decrypted !== "object") {
    throw new Error("uzum_credentials_invalid");
  }

  const rec = decrypted as Record<string, unknown>;

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

type ParsedWebhookSecret = {
  webhookSecret: string | null;
};

function parseWebhookSecret(raw: unknown): ParsedWebhookSecret {
  const decrypted = decryptSecretJsonMaybe(raw);
  if (!decrypted) return { webhookSecret: null };

  if (typeof decrypted === "string" && decrypted.trim()) {
    return { webhookSecret: decrypted.trim() };
  }

  if (typeof decrypted === "object") {
    const rec = decrypted as Record<string, unknown>;
    const keys = ["secret", "webhookSecret", "token", "signatureSecret"];
    for (const key of keys) {
      const value = rec[key];
      if (typeof value === "string" && value.trim()) {
        return { webhookSecret: value.trim() };
      }
    }
  }

  return { webhookSecret: null };
}

function parseSignatureHeader(headers: Record<string, string | null>) {
  const candidateKeys = [
    "x-uzum-signature",
    "x-signature",
    "signature",
    "x-sign",
  ];

  for (const key of candidateKeys) {
    const value = headers[key] ?? headers[key.toLowerCase()];
    if (!value) continue;

    const normalized = value.trim();
    if (!normalized) continue;
    if (normalized.startsWith("sha256=")) {
      return normalized.slice("sha256=".length);
    }
    return normalized;
  }

  return null;
}

function isValidHmacSignature({
  rawBody,
  secret,
  signature,
}: {
  rawBody: string;
  secret: string;
  signature: string;
}) {
  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const normalized = signature.toLowerCase();
  const expected = Buffer.from(expectedHex, "utf8");
  const got = Buffer.from(normalized, "utf8");
  if (expected.length !== got.length) return false;
  return crypto.timingSafeEqual(expected, got);
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
  viewType?: "WEB_VIEW" | "IFRAME" | "REDIRECT";
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
  const viewType = ctx.viewType ?? "REDIRECT";
  const body = {
    amount: intent.amount_minor,
    clientId: session.customer_id ?? session.org_id,
    currency: uzumCurrencyCode(intent.currency),
    paymentDetails: intent.description ?? "Payment",
    orderNumber: pickOrderNumber(intent.id, intent.order_id),
    viewType,
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
    if (errorCode === 3045) {
      throw new Error("uzum_autofiscalization_cart_required");
    }
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

export async function verifyUzumWebhookSignature(params: {
  supabase: any;
  orgProviderAccountId: string | null | undefined;
  rawBody: string;
  headers: Record<string, string | null>;
  allowUnsigned: boolean;
}) {
  if (!params.orgProviderAccountId) {
    if (params.allowUnsigned) return;
    throw new Error("uzum_webhook_missing_org_provider_account");
  }

  const secrets = await getOrgProviderAccountSecrets(
    params.supabase,
    params.orgProviderAccountId,
  );
  const { webhookSecret } = parseWebhookSecret(secrets.webhook_secret_encrypted);

  if (!webhookSecret) {
    if (params.allowUnsigned) return;
    throw new Error("uzum_webhook_secret_missing");
  }

  const signature = parseSignatureHeader(params.headers);
  if (!signature) {
    if (params.allowUnsigned) return;
    throw new Error("uzum_webhook_signature_missing");
  }

  const isValid = isValidHmacSignature({
    rawBody: params.rawBody,
    secret: webhookSecret,
    signature,
  });

  if (!isValid) {
    throw new Error("uzum_webhook_signature_invalid");
  }
}

type CreateRecurringChargeInput = {
  supabase: any;
  orgProviderAccountId: string;
  paymentIntentId: string;
  providerToken: string;
  clientId: string;
  description: string | null;
  orderNumber: string;
  currency: string;
  amountMinor: number;
  phoneNumber?: string | null;
};

type RecurringChargeResult = {
  providerPaymentId?: string;
  status: "succeeded" | "processing" | "failed";
  raw: Record<string, unknown>;
};

export async function createUzumRecurringCharge(
  input: CreateRecurringChargeInput,
): Promise<RecurringChargeResult> {
  const secrets = await getOrgProviderAccountSecrets(
    input.supabase,
    input.orgProviderAccountId,
  );
  const creds = parseUzumCredentials(secrets.credentials_encrypted);
  const apiBaseUrl = normalizeBaseUrl(creds.apiBaseUrl);

  const url = `${apiBaseUrl}/api/v1/payment/merchantPay`;
  const body: Record<string, unknown> = {
    clientId: input.clientId,
    amount: input.amountMinor,
    currency: uzumCurrencyCode(input.currency),
    paymentDetails: input.description ?? "Subscription renewal",
    orderNumber: input.orderNumber,
    paymentParams: {
      payType: "TWO_STEP",
      operationType: "AUTHORIZE",
      bindingId: input.providerToken,
      ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
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
    return {
      status: "failed",
      raw: { request: body, response: json, httpStatus: res.status },
    };
  }

  const result = json?.result ?? {};
  const actionCode = Number(json?.actionCode ?? result?.actionCode ?? 0);
  const operationState = String(
    json?.operationState ?? result?.operationState ?? "",
  ).toUpperCase();

  const providerPaymentId =
    (typeof json?.orderId === "string" && json.orderId) ||
    (typeof result?.orderId === "string" && result.orderId) ||
    undefined;

  const status =
    operationState === "SUCCESS" || actionCode === 0
      ? "succeeded"
      : operationState === "PROCESSING"
        ? "processing"
        : "failed";

  return {
    providerPaymentId,
    status,
    raw: { request: body, response: json },
  };
}
