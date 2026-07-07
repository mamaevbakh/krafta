import crypto from "crypto";

/**
 * Internal (server-to-server, HMAC-signed) client for Krafta Pay.
 *
 * Storefront card payments use the BYOA model: each merchant connects their OWN
 * Atmos account, and the customer's money settles directly to them. The public
 * Krafta Pay API derives the org from the caller's API key (always the caller's
 * own org), so it can't create payments for many merchants. These internal
 * endpoints take an explicit merchant `orgId` and are gated by the shared
 * `KRAFTA_PAY_INTERNAL_SECRET` — the same HMAC scheme Krafta Pay verifies with
 * `verifyInternalRequest` (sig = HMAC-SHA256(secret, `${timestamp}.${rawBody}`)).
 */

function getPayBaseUrl() {
  return process.env.KRAFTA_PAY_URL ?? process.env.PAY_BASE_URL ?? "http://localhost:3001";
}

function getInternalSecret() {
  const secret =
    process.env.KRAFTA_PAY_INTERNAL_SECRET ?? process.env.BILLING_INTERNAL_SECRET;
  if (!secret) {
    throw new Error("missing_krafta_pay_internal_secret");
  }
  return secret;
}

async function signedFetch(
  path: string,
  method: "POST" | "DELETE",
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; json: any }> {
  const baseUrl = getPayBaseUrl().replace(/\/+$/, "");
  const secret = getInternalSecret();
  const rawBody = JSON.stringify(body);
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-krafta-timestamp": timestamp,
      "x-krafta-signature": `sha256=${signature}`,
    },
    body: rawBody,
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

// ---------------------------------------------------------------------------
// Connect / disconnect a merchant's Atmos account (BYOA)
// ---------------------------------------------------------------------------

export type ConnectAtmosInput = {
  orgId: string;
  consumerKey: string;
  consumerSecret: string;
  storeId: string;
  apiBaseUrl?: string;
  displayLabel?: string;
  initiatedByUserId?: string;
};

export type ConnectAtmosResult =
  | { ok: true; environment: "test" | "live"; storeId: string; verified: boolean }
  | { ok: false; error: "credentials_rejected" | "forbidden" | "unknown" };

export async function connectMerchantAtmos(
  input: ConnectAtmosInput,
): Promise<ConnectAtmosResult> {
  const { ok, status, json } = await signedFetch(
    "/api/internal/providers/atmos",
    "POST",
    { ...input },
  );
  if (ok && json?.connected) {
    return {
      ok: true,
      environment: json.environment,
      storeId: String(json.storeId),
      verified: Boolean(json.verified),
    };
  }
  if (status === 400 && json?.error === "atmos_credentials_rejected") {
    return { ok: false, error: "credentials_rejected" };
  }
  if (status === 403) return { ok: false, error: "forbidden" };
  return { ok: false, error: "unknown" };
}

export async function disconnectMerchantAtmos(input: {
  orgId: string;
  initiatedByUserId?: string;
}): Promise<{ ok: boolean }> {
  const { ok } = await signedFetch("/api/internal/providers/atmos", "DELETE", {
    ...input,
  });
  return { ok };
}

// ---------------------------------------------------------------------------
// One-off order payment
// ---------------------------------------------------------------------------

export type CreateOrderCheckoutInput = {
  orgId: string;
  amountMinor: number;
  currency: string;
  orderId: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  returnUrl?: string;
  customer?: { email?: string; phone?: string; customerUserRef?: string };
  metadata?: Record<string, unknown>;
};

export type CreateOrderCheckoutResult =
  | {
      ok: true;
      checkoutSessionId: string;
      paymentIntentId: string;
      publicToken: string;
      payUrl: string;
    }
  | { ok: false; error: "provider_not_configured" | "unknown" };

export async function createOrderCheckoutSession(
  input: CreateOrderCheckoutInput,
): Promise<CreateOrderCheckoutResult> {
  const { ok, status, json } = await signedFetch(
    "/api/internal/checkout_sessions",
    "POST",
    { ...input },
  );
  if (ok && json?.payUrl) {
    return {
      ok: true,
      checkoutSessionId: json.checkoutSessionId,
      paymentIntentId: json.paymentIntentId,
      publicToken: json.publicToken,
      payUrl: json.payUrl,
    };
  }
  if (status === 409 && json?.error === "provider_not_configured") {
    return { ok: false, error: "provider_not_configured" };
  }
  return { ok: false, error: "unknown" };
}

// ---------------------------------------------------------------------------
// Status read-back
// ---------------------------------------------------------------------------

/** Public status by checkout-session public token (token-gated, no auth). */
export async function getCheckoutStatusByToken(
  publicToken: string,
): Promise<{ intentStatus: string | null; sessionStatus: string | null }> {
  const baseUrl = getPayBaseUrl().replace(/\/+$/, "");
  const res = await fetch(
    `${baseUrl}/api/checkout_sessions/${encodeURIComponent(publicToken)}/status`,
    { cache: "no-store" },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) return { intentStatus: null, sessionStatus: null };
  return {
    intentStatus: json?.paymentIntent?.status ?? null,
    sessionStatus: json?.checkoutSession?.status ?? null,
  };
}

/** Batch payment-intent status by id (for reconciling pending card orders). */
export async function getPaymentIntentStatuses(
  intentIds: string[],
): Promise<Record<string, string>> {
  if (intentIds.length === 0) return {};
  const { ok, json } = await signedFetch(
    "/api/internal/payment_intents/status",
    "POST",
    { intentIds },
  );
  if (ok && json?.statuses && typeof json.statuses === "object") {
    return json.statuses as Record<string, string>;
  }
  return {};
}
