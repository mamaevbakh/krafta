import type { ProviderAttemptResult } from "./index";
import crypto from "crypto";

import { getCheckoutSessionByPublicToken, getOrgProviderAccountSecrets, getPaymentIntentById } from "../db";
import { writePaymentDebugLog } from "../debug-log";
import { decryptSecretJsonMaybe } from "../secrets";

type UzumCredentials = {
  apiBaseUrl: string;
  terminalId: string;
  apiKey: string;
  contentLanguage?: "ru-RU" | "uz-UZ" | "en-EN";
};

type UzumViewType = "WEB_VIEW" | "IFRAME" | "REDIRECT";

function assertString(v: unknown, name: string): asserts v is string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`${name}_is_required`);
  }
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function pickHttpsUrl(...candidates: Array<string | null | undefined>) {
  return candidates.find((u) => typeof u === "string" && u.startsWith("https://")) ?? null;
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

function pickCheckoutCallbackUrls(payBaseUrl: string, publicToken: string) {
  const base = payBaseUrl.replace(/\/+$/, "");
  const successUrl = pickHttpsUrl(`${base}/pay/${publicToken}/success`);
  const failureUrl = pickHttpsUrl(`${base}/pay/${publicToken}/failure`);

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

function buildRecurringReturnUrl(returnUrl?: string | null) {
  const configuredBase = process.env.PAY_BASE_URL?.replace(/\/+$/, "");
  const configuredFallback = configuredBase ? `${configuredBase}/pay/return` : null;
  const hardFallback = "https://pay.krafta.uz/pay/return";
  const resolved = pickHttpsUrl(returnUrl, configuredFallback, hardFallback);
  if (!resolved) {
    throw new Error("uzum_requires_https_success_and_failure_urls");
  }
  return resolved;
}

function redactForDebug(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactForDebug);

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (key === "bindingId" && typeof raw === "string") {
      out[key] =
        raw.length > 8 ? `${raw.slice(0, 4)}...${raw.slice(-4)}` : "***";
      continue;
    }
    if (key.toLowerCase() === "cvc" && typeof raw === "string") {
      out[key] = "***";
      continue;
    }
    out[key] = redactForDebug(raw);
  }
  return out;
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

function getUzumHeaders(creds: UzumCredentials) {
  return {
    "Content-Type": "application/json",
    "Content-Language": creds.contentLanguage ?? "ru-RU",
    "X-Terminal-Id": creds.terminalId,
    "X-API-Key": creds.apiKey,
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
  viewType?: UzumViewType;
};

export async function createUzumAttempt(ctx: CreateAttemptCtx): Promise<ProviderAttemptResult> {
  // Load session + intent
  const session = await getCheckoutSessionByPublicToken(ctx.supabase, ctx.publicToken);
  const intent = await getPaymentIntentById(ctx.supabase, ctx.paymentIntentId);

  // Load credentials (stored as JSON; naming includes "encrypted" but the decrypt step is handled elsewhere)
  const secrets = await getOrgProviderAccountSecrets(ctx.supabase, ctx.orgProviderAccountId);
  const creds = parseUzumCredentials(secrets.credentials_encrypted);

  const apiBaseUrl = normalizeBaseUrl(creds.apiBaseUrl);
  const { successUrl, failureUrl } = pickCheckoutCallbackUrls(
    ctx.payBaseUrl,
    ctx.publicToken,
  );

  const url = `${apiBaseUrl}/api/v1/payment/register`;

  const cart = getUzumCartFromMetadata(session.metadata);
  let customerPhone: string | null = null;
  if (session.customer_id) {
    const { data: customer, error: customerErr } = await ctx.supabase
      .schema("payments")
      .from("customers")
      .select("phone")
      .eq("id", session.customer_id)
      .maybeSingle();
    if (customerErr) throw customerErr;
    customerPhone = customer?.phone ?? null;
  }

  const viewType = ctx.viewType ?? "WEB_VIEW";
  const body = {
    amount: intent.amount_minor,
    clientId: session.customer_id ?? session.org_id,
    currency: uzumCurrencyCode(intent.currency),
    paymentDetails: intent.description ?? "Card binding",
    orderNumber: pickOrderNumber(intent.id, intent.order_id),
    viewType,
    sessionTimeoutSecs: 1800,
    successUrl,
    failureUrl,
    ...(cart ? { merchantParams: { cart } } : {}),
    paymentParams: {
      payType: "TWO_STEP",
      operationType: "BINDING",
      ...(customerPhone ? { phoneNumber: customerPhone } : {}),
    },
  };

  await writePaymentDebugLog(ctx.supabase, {
    scope: "uzum",
    event: "register.request",
    providerId: "uzum",
    publicToken: ctx.publicToken,
    paymentIntentId: ctx.paymentIntentId,
    paymentAttemptId: ctx.paymentAttemptId,
    data: {
      url,
      callbackUrls: { successUrl, failureUrl },
      request: redactForDebug(body) as Record<string, unknown>,
    },
  });

  const res = await fetch(url, {
    method: "POST",
    headers: getUzumHeaders(creds),
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as any;

  await writePaymentDebugLog(ctx.supabase, {
    scope: "uzum",
    event: "register.response",
    providerId: "uzum",
    publicToken: ctx.publicToken,
    paymentIntentId: ctx.paymentIntentId,
    paymentAttemptId: ctx.paymentAttemptId,
    level: res.ok ? "info" : "warn",
    data: {
      httpStatus: res.status,
      response: redactForDebug(json) as Record<string, unknown> | null,
    },
  });

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
  orderId?: string | null;
  returnUrl?: string | null;
  viewType?: UzumViewType;
  uzumCart?: unknown;
  phoneNumber?: string | null;
  cvc?: string | null;
  publicToken?: string | null;
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
  const headers = getUzumHeaders(creds);
  const returnUrl = buildRecurringReturnUrl(input.returnUrl);

  const cart =
    input.uzumCart && typeof input.uzumCart === "object" ? input.uzumCart : null;
  let orderId = input.orderId?.trim() || null;

  let registerPayload: Record<string, unknown> | null = null;
  let registerResponse: unknown = null;
  if (!orderId) {
    const registerUrl = `${apiBaseUrl}/api/v1/payment/register`;
    registerPayload = {
      amount: input.amountMinor,
      clientId: input.clientId,
      currency: uzumCurrencyCode(input.currency),
      paymentDetails: input.description ?? "Subscription renewal",
      orderNumber: input.orderNumber,
      viewType: input.viewType ?? "REDIRECT",
      sessionTimeoutSecs: 1800,
      successUrl: returnUrl,
      failureUrl: returnUrl,
      ...(cart ? { merchantParams: { cart } } : {}),
      paymentParams: {
        payType: "ONE_STEP",
      },
    };

    const registerRes = await fetch(registerUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(registerPayload),
    });

    registerResponse = (await registerRes.json().catch(() => null)) as any;
    await writePaymentDebugLog(input.supabase, {
      scope: "uzum",
      event: "merchant_pay.register_for_order.response",
      providerId: "uzum",
      publicToken: input.publicToken ?? null,
      paymentIntentId: input.paymentIntentId,
      level: registerRes.ok ? "info" : "warn",
      data: {
        url: registerUrl,
        request: redactForDebug(registerPayload) as Record<string, unknown>,
        httpStatus: registerRes.status,
        response: redactForDebug(registerResponse) as Record<string, unknown> | null,
      },
    });
    if (!registerRes.ok) {
      return {
        status: "failed",
        raw: {
          register: {
            request: registerPayload,
            response: registerResponse,
            httpStatus: registerRes.status,
          },
        },
      };
    }

    const registerErrorCode = Number((registerResponse as any)?.errorCode ?? 0);
    if (registerErrorCode !== 0) {
      return {
        status: "failed",
        raw: {
          register: {
            request: registerPayload,
            response: registerResponse,
            errorCode: registerErrorCode,
          },
        },
      };
    }

    orderId =
      (typeof (registerResponse as any)?.result?.orderId === "string" &&
        (registerResponse as any).result.orderId) ||
      null;
    if (!orderId) {
      return {
        status: "failed",
        raw: {
          register: {
            request: registerPayload,
            response: registerResponse,
            error: "missing_order_id",
          },
        },
      };
    }
  }

  const url = `${apiBaseUrl}/api/v1/payment/merchantPay`;
  const body: Record<string, unknown> = {
    clientId: input.clientId,
    amount: input.amountMinor,
    currency: uzumCurrencyCode(input.currency),
    paymentDetails: input.description ?? "Subscription renewal",
    orderNumber: input.orderNumber,
    orderId,
    returnUrl,
    ...(cart ? { merchantParams: { cart } } : {}),
    processData: {
      type: "bind",
      bindingId: input.providerToken,
      ...(input.cvc ? { cvc: input.cvc } : {}),
    },
    // Compatibility fallback for older schema variants.
    paymentParams: {
      payType: "TWO_STEP",
      operationType: "AUTHORIZE",
      bindingId: input.providerToken,
      ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
    },
  };

  await writePaymentDebugLog(input.supabase, {
    scope: "uzum",
    event: "merchant_pay.request",
    providerId: "uzum",
    publicToken: input.publicToken ?? null,
    paymentIntentId: input.paymentIntentId,
    data: {
      url,
      request: redactForDebug(body) as Record<string, unknown>,
    },
  });

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as any;
  await writePaymentDebugLog(input.supabase, {
    scope: "uzum",
    event: "merchant_pay.response",
    providerId: "uzum",
    publicToken: input.publicToken ?? null,
    paymentIntentId: input.paymentIntentId,
    level: res.ok ? "info" : "warn",
    data: {
      httpStatus: res.status,
      response: redactForDebug(json) as Record<string, unknown> | null,
    },
  });
  if (!res.ok) {
    return {
      status: "failed",
      raw: {
        register: registerPayload ? { request: registerPayload, response: registerResponse } : null,
        merchantPay: { request: body, response: json, httpStatus: res.status },
      },
    };
  }

  const result = json?.result ?? {};
  const errorCode = Number(json?.errorCode ?? result?.errorCode ?? 0);
  const actionCode = Number(json?.actionCode ?? result?.actionCode ?? 0);
  const operationState = String(
    json?.operationState ?? result?.operationState ?? "",
  ).toUpperCase();

  const providerPaymentId =
    (typeof json?.orderId === "string" && json.orderId) ||
    (typeof result?.orderId === "string" && result.orderId) ||
    undefined;

  const status =
    errorCode !== 0
      ? "failed"
      : operationState === "SUCCESS" || actionCode === 0
      ? "succeeded"
      : operationState === "PROCESSING"
        ? "processing"
        : "failed";

  return {
    providerPaymentId,
    status,
    raw: {
      register: registerPayload ? { request: registerPayload, response: registerResponse } : null,
      merchantPay: { request: body, response: json },
    },
  };
}
