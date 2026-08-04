import type { ProviderAttemptResult } from "./index";
import crypto from "crypto";

import { getCheckoutSessionByPublicToken, getOrgProviderAccountSecrets, getPaymentIntentById } from "../db";
import { writePaymentDebugLog } from "../debug-log";
import { decryptSecretJsonMaybe } from "../secrets";
import { redactSensitive } from "../redact";

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

/**
 * A distinct, spec-legal Uzum `orderNumber` derived from one of our uuids.
 *
 * Two Uzum constraints collide here. `orderNumber` has maxLength 36, and a uuid
 * is exactly 36 — so a prefixed form like `charge-<uuid>` (43) or
 * `renewal-<uuid>` (44) is over the limit and invites errorCode 2000
 * (ValidationError). But the prefix is load-bearing: a repeat orderNumber is
 * rejected with 3027, and the same attempt legitimately registers two different
 * Uzum orders — one to bind the card, one to charge it.
 *
 * Stripping the dashes buys the room: `c-` + 32 hex = 34 characters, and it is a
 * different string from the dashed uuid the binding leg registers under.
 */
export function uzumOrderNumber(prefix: string, id: string) {
  return `${prefix}-${id.replace(/-/g, "")}`.slice(0, 36);
}

// Uzum caps `paymentDetails` at 1024 chars. The merchant's own order id used to
// travel as `orderNumber`; that slot now belongs to the attempt (see
// createUzumAttempt), so the reference rides along here instead — it is what the
// merchant recognises in Uzum's cabinet when reconciling.
function buildPaymentDetails(description: string | null, orderId: string | null) {
  const base = description ?? "Card binding";
  const detail = orderId ? `${base} · ${orderId}` : base;
  return detail.length > 1024 ? detail.slice(0, 1024) : detail;
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

// Redaction is centralized in ../redact so PAN/OTP/token/secret keys are masked
// consistently across providers, the debug logger, and persisted payloads.
const redactForDebug = redactSensitive;

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

function withOperationId(
  headers: Record<string, string>,
  operationId = crypto.randomUUID(),
) {
  return {
    headers: {
      ...headers,
      "X-Operation-Id": operationId,
    },
    operationId,
  };
}

function redactUzumHeadersForDebug(headers: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const k = key.toLowerCase();
    if (k === "x-api-key" || k === "x-terminal-id") {
      out[key] = value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : "***";
      continue;
    }
    out[key] = value;
  }
  return out;
}

function shellEscapeSingleQuotes(value: string) {
  return value.replace(/'/g, `'\"'\"'`);
}

function buildDebugHttpCall(params: {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}) {
  const redactedBody = redactForDebug(params.body) as Record<string, unknown>;
  const redactedHeaders = redactUzumHeadersForDebug(params.headers);
  const bodyJson = JSON.stringify(redactedBody, null, 2);
  const curlParts = [
    `curl -X ${params.method}`,
    `'${shellEscapeSingleQuotes(params.url)}'`,
    ...Object.entries(redactedHeaders).map(
      ([k, v]) => `-H '${shellEscapeSingleQuotes(`${k}: ${v}`)}'`,
    ),
    `-d '${shellEscapeSingleQuotes(bodyJson)}'`,
  ];

  return {
    method: params.method,
    url: params.url,
    headers: redactedHeaders,
    body: redactedBody,
    curl: curlParts.join(" \\\n  "),
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
    paymentDetails: buildPaymentDetails(intent.description, intent.order_id),
    // One Uzum order per ATTEMPT, not per intent.
    //
    // Uzum register is not idempotent on orderNumber: a repeat comes back as
    // errorCode 3027 ("Payment with this order number already exists"), which
    // createUzumAttempt throws on. Keying this to the intent therefore made a
    // second registration for the same checkout impossible — so once the first
    // order aged out of its 30-minute window (sessionTimeoutSecs below is
    // Uzum's documented maximum, not our choice), the customer could only ever
    // be handed the same dead link back. Attempt ids give every re-open a fresh,
    // live order. Every other Uzum register here already works this way.
    //
    // Attempt ids are uuids — exactly Uzum's `orderNumber` maxLength of 36, so
    // no prefix fits. Do not add one.
    orderNumber: ctx.paymentAttemptId,
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
      debugCall: buildDebugHttpCall({
        method: "POST",
        url,
        headers: getUzumHeaders(creds),
        body,
      }),
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
  // Provider payment order ID for the actual charge operation.
  // Do not pass the binding orderId here after a BINDING flow.
  chargeOrderId?: string | null;
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

export type UzumChargeProviderRefs = {
  chargeOrderId: string | null;
  merchantPayOrderId: string | null;
  merchantPayOperationId: string | null;
  merchantPayMdOrder: string | null;
  chargeOrderIdSource: "provided" | "registered" | null;
};

type EnsureChargeOrderInput = {
  supabase: any;
  apiBaseUrl: string;
  baseHeaders: Record<string, string>;
  publicToken?: string | null;
  paymentIntentId: string;
  clientId: string;
  description: string | null;
  orderNumber: string;
  currency: string;
  amountMinor: number;
  returnUrl: string;
  viewType?: UzumViewType;
  cart?: unknown | null;
  existingChargeOrderId?: string | null;
};

type EnsureChargeOrderResult = {
  chargeOrderId: string;
  source: "provided" | "registered";
  registerPayload: Record<string, unknown> | null;
  registerResponse: unknown;
};

async function ensureUzumChargeOrderId(
  input: EnsureChargeOrderInput,
): Promise<EnsureChargeOrderResult> {
  const provided = input.existingChargeOrderId?.trim() || null;
  if (provided) {
    return {
      chargeOrderId: provided,
      source: "provided",
      registerPayload: null,
      registerResponse: null,
    };
  }

  const registerUrl = `${input.apiBaseUrl}/api/v1/payment/register`;
  const registerPayload: Record<string, unknown> = {
    amount: input.amountMinor,
    clientId: input.clientId,
    currency: uzumCurrencyCode(input.currency),
    paymentDetails: input.description ?? "Subscription renewal",
    orderNumber: input.orderNumber,
    viewType: input.viewType ?? "REDIRECT",
    sessionTimeoutSecs: 1800,
    successUrl: input.returnUrl,
    failureUrl: input.returnUrl,
    ...(input.cart ? { merchantParams: { cart: input.cart } } : {}),
    paymentParams: {
      payType: "ONE_STEP",
    },
  };

  const registerHeadersWithOperationId = withOperationId(input.baseHeaders);
  await writePaymentDebugLog(input.supabase, {
    scope: "uzum",
    event: "merchant_pay.register_for_order.request",
    providerId: "uzum",
    publicToken: input.publicToken ?? null,
    paymentIntentId: input.paymentIntentId,
    data: {
      url: registerUrl,
      operationId: registerHeadersWithOperationId.operationId,
      request: redactForDebug(registerPayload) as Record<string, unknown>,
      debugCall: buildDebugHttpCall({
        method: "POST",
        url: registerUrl,
        headers: registerHeadersWithOperationId.headers,
        body: registerPayload,
      }),
    },
  });

  const registerRes = await fetch(registerUrl, {
    method: "POST",
    headers: registerHeadersWithOperationId.headers,
    body: JSON.stringify(registerPayload),
  });

  const registerResponse = (await registerRes.json().catch(() => null)) as any;
  await writePaymentDebugLog(input.supabase, {
    scope: "uzum",
    event: "merchant_pay.register_for_order.response",
    providerId: "uzum",
    publicToken: input.publicToken ?? null,
    paymentIntentId: input.paymentIntentId,
    level: registerRes.ok ? "info" : "warn",
    data: {
      url: registerUrl,
      operationId: registerHeadersWithOperationId.operationId,
      request: redactForDebug(registerPayload) as Record<string, unknown>,
      httpStatus: registerRes.status,
      response: redactForDebug(registerResponse) as Record<string, unknown> | null,
    },
  });

  if (!registerRes.ok) {
    throw new Error(`uzum_charge_order_register_http_${registerRes.status}`);
  }

  const registerErrorCode = Number(registerResponse?.errorCode ?? 0);
  if (registerErrorCode !== 0) {
    throw new Error(`uzum_charge_order_register_error:${registerErrorCode}`);
  }

  const chargeOrderId =
    (typeof registerResponse?.result?.orderId === "string" && registerResponse.result.orderId) || null;
  if (!chargeOrderId) {
    throw new Error("uzum_charge_order_register_missing_order_id");
  }

  return {
    chargeOrderId,
    source: "registered",
    registerPayload,
    registerResponse,
  };
}

export async function createUzumRecurringCharge(
  input: CreateRecurringChargeInput,
): Promise<RecurringChargeResult> {
  const secrets = await getOrgProviderAccountSecrets(
    input.supabase,
    input.orgProviderAccountId,
  );
  const creds = parseUzumCredentials(secrets.credentials_encrypted);
  const apiBaseUrl = normalizeBaseUrl(creds.apiBaseUrl);
  const baseHeaders = getUzumHeaders(creds);
  const returnUrl = buildRecurringReturnUrl(input.returnUrl);

  const cart =
    input.uzumCart && typeof input.uzumCart === "object" ? input.uzumCart : null;
  let chargeOrder: EnsureChargeOrderResult;
  try {
    chargeOrder = await ensureUzumChargeOrderId({
      supabase: input.supabase,
      apiBaseUrl,
      baseHeaders,
      publicToken: input.publicToken ?? null,
      paymentIntentId: input.paymentIntentId,
      clientId: input.clientId,
      description: input.description,
      orderNumber: input.orderNumber,
      currency: input.currency,
      amountMinor: input.amountMinor,
      returnUrl,
      viewType: input.viewType,
      cart,
      existingChargeOrderId: input.chargeOrderId ?? null,
    });
  } catch (error) {
    return {
      status: "failed",
      raw: {
        register: null,
        merchantPay: null,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const url = `${apiBaseUrl}/api/v1/payment/merchantPay`;
  const body: Record<string, unknown> = {
    processData: {
      type: "bind",
      bindingId: input.providerToken,
      ...(input.cvc ? { cvc: input.cvc } : {}),
    },
    orderId: chargeOrder.chargeOrderId,
    returnUrl,
  };

  const merchantPayHeadersWithOperationId = withOperationId(baseHeaders);

  await writePaymentDebugLog(input.supabase, {
    scope: "uzum",
    event: "merchant_pay.request",
    providerId: "uzum",
    publicToken: input.publicToken ?? null,
    paymentIntentId: input.paymentIntentId,
    data: {
      url,
      operationId: merchantPayHeadersWithOperationId.operationId,
      chargeOrderIdSource: chargeOrder.source,
      request: redactForDebug(body) as Record<string, unknown>,
      debugCall: buildDebugHttpCall({
        method: "POST",
        url,
        headers: merchantPayHeadersWithOperationId.headers,
        body,
      }),
    },
  });

  const res = await fetch(url, {
    method: "POST",
    headers: merchantPayHeadersWithOperationId.headers,
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
      operationId: merchantPayHeadersWithOperationId.operationId,
      chargeOrderIdSource: chargeOrder.source,
      response: redactForDebug(json) as Record<string, unknown> | null,
    },
  });
  if (!res.ok) {
    return {
      status: "failed",
      raw: {
        register:
          chargeOrder.registerPayload
            ? { request: chargeOrder.registerPayload, response: chargeOrder.registerResponse }
            : null,
        chargeOrderIdSource: chargeOrder.source,
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
      register:
        chargeOrder.registerPayload
          ? { request: chargeOrder.registerPayload, response: chargeOrder.registerResponse }
          : null,
      chargeOrderIdSource: chargeOrder.source,
      merchantPay: { request: body, response: json },
    },
  };
}

export function extractUzumChargeProviderRefs(raw: unknown): UzumChargeProviderRefs {
  const top = isRecord(raw) ? raw : null;

  const chargeOrderIdSource = (() => {
    const value = top?.chargeOrderIdSource;
    return value === "provided" || value === "registered" ? value : null;
  })();

  const registerResponse = isRecord(top?.register)
    ? isRecord((top!.register as Record<string, unknown>).response)
      ? ((top!.register as Record<string, unknown>).response as Record<string, unknown>)
      : null
    : null;

  const merchantPay = isRecord(top?.merchantPay)
    ? (top!.merchantPay as Record<string, unknown>)
    : null;
  const merchantPayRequest = isRecord(merchantPay?.request)
    ? (merchantPay!.request as Record<string, unknown>)
    : null;
  const merchantPayResponse = isRecord(merchantPay?.response)
    ? (merchantPay!.response as Record<string, unknown>)
    : null;
  const merchantPayResult = isRecord(merchantPayResponse?.result)
    ? (merchantPayResponse!.result as Record<string, unknown>)
    : null;
  const registerResult = isRecord(registerResponse?.result)
    ? (registerResponse!.result as Record<string, unknown>)
    : null;

  const chargeOrderId =
    pickString(registerResult?.orderId) ??
    pickString(merchantPayRequest?.orderId) ??
    pickString(merchantPayResult?.orderId) ??
    pickString(merchantPayResponse?.orderId) ??
    null;

  const merchantPayOrderId =
    pickString(merchantPayResult?.orderId) ??
    pickString(merchantPayResponse?.orderId) ??
    null;

  const merchantPayOperationId =
    pickString(merchantPayResult?.operationId) ??
    pickString(merchantPayResponse?.operationId) ??
    null;

  const merchantPayMdOrder =
    pickString(merchantPayResult?.mdOrder) ??
    pickString(merchantPayResponse?.mdOrder) ??
    null;

  return {
    chargeOrderId,
    merchantPayOrderId,
    merchantPayOperationId,
    merchantPayMdOrder,
    chargeOrderIdSource,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
