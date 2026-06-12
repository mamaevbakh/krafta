import type { SupabaseClient } from "@supabase/supabase-js";

import { getOrgProviderAccountSecrets } from "../db";
import { decryptSecretJsonMaybe } from "../secrets";
import { redactSensitive } from "../redact";
import type { ProviderAttemptResult } from "./index";

// Atmos (atmos.uz) — INLINE + SAVE_CARD provider. Unlike Uzum (redirect/binding
// webhook), Atmos is driven server-to-server and settles synchronously: the card
// is collected on pay.krafta.uz and confirmed with a single SMS code.
//
// Flow for a first subscription charge (one OTP, card saved):
//   1. bind-card/init {card_number, expiry}  -> SMS OTP to cardholder
//   2. bind-card/confirm {transaction_id, otp} -> reusable card_token
//   3. off-session charge with that token (NO second OTP):
//        pay/create -> pay/pre-apply {card_token} -> pay/apply {otp:"111111"}
// Renewals reuse step 3 only (createAtmosRecurringCharge).
//
// Every endpoint/field below is from the Atmos API documentation; all card data,
// OTPs and tokens pass through redactSensitive before any logging/persistence.

export type AtmosCredentials = {
  apiBaseUrl: string; // default https://apigw.atmos.uz
  consumerKey: string;
  consumerSecret: string;
  storeId: string;
};

const DEFAULT_BASE_URL = "https://apigw.atmos.uz";

function normalizeBaseUrl(baseUrl: string) {
  return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function parseAtmosCredentials(credentials: unknown): AtmosCredentials {
  const decrypted = decryptSecretJsonMaybe(credentials);
  if (!decrypted || typeof decrypted !== "object") {
    throw new Error("atmos_credentials_invalid");
  }
  const rec = decrypted as Record<string, unknown>;
  const consumerKey = rec.consumerKey ?? rec.consumer_key;
  const consumerSecret = rec.consumerSecret ?? rec.consumer_secret;
  const storeId = rec.storeId ?? rec.store_id;
  const apiBaseUrl = rec.apiBaseUrl ?? rec.api_base_url ?? DEFAULT_BASE_URL;

  if (typeof consumerKey !== "string" || consumerKey.trim() === "") {
    throw new Error("atmos_consumer_key_required");
  }
  if (typeof consumerSecret !== "string" || consumerSecret.trim() === "") {
    throw new Error("atmos_consumer_secret_required");
  }
  if (storeId === undefined || storeId === null || String(storeId).trim() === "") {
    throw new Error("atmos_store_id_required");
  }

  return {
    apiBaseUrl: typeof apiBaseUrl === "string" ? apiBaseUrl : DEFAULT_BASE_URL,
    consumerKey,
    consumerSecret,
    storeId: String(storeId),
  };
}

// ---------------------------------------------------------------------------
// OAuth2 client_credentials token (Basic base64(key:secret)), cached ~1h.
// ---------------------------------------------------------------------------

type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

async function getAtmosAccessToken(creds: AtmosCredentials): Promise<string> {
  const now = Date.now();
  const cached = tokenCache.get(creds.consumerKey);
  // refresh a minute early to avoid mid-flight expiry
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.token;
  }

  const basic = Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString("base64");
  const url = `${normalizeBaseUrl(creds.apiBaseUrl)}/token?grant_type=client_credentials`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const token = json.access_token;
  if (!res.ok || typeof token !== "string" || token === "") {
    throw new Error("atmos_token_failed");
  }
  const expiresIn = Number(json.expires_in ?? 3600);
  tokenCache.set(creds.consumerKey, {
    token,
    expiresAt: now + Math.max(60, expiresIn) * 1000,
  });
  return token;
}

async function atmosPost(
  creds: AtmosCredentials,
  path: string,
  body: Record<string, unknown>,
): Promise<{ httpStatus: number; json: Record<string, unknown> }> {
  const token = await getAtmosAccessToken(creds);
  const url = `${normalizeBaseUrl(creds.apiBaseUrl)}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { httpStatus: res.status, json };
}

// ---------------------------------------------------------------------------
// Card binding (save card) — returns a reusable card_token.
// ---------------------------------------------------------------------------

export type AtmosBindInitResult = {
  transactionId: string;
  phone?: string | null;
  raw: Record<string, unknown>;
};

export async function atmosBindInit(
  creds: AtmosCredentials,
  input: { cardNumber: string; expiry: string },
): Promise<AtmosBindInitResult> {
  const { json } = await atmosPost(creds, "/partner/bind-card/init", {
    card_number: input.cardNumber,
    expiry: input.expiry,
  });
  const code = String((json.result as any)?.code ?? "");
  const transactionId = json.transaction_id;
  if (code !== "OK" || transactionId === undefined || transactionId === null) {
    throw new AtmosError("atmos_bind_init_failed", json);
  }
  return {
    transactionId: String(transactionId),
    phone: typeof json.phone === "string" ? json.phone : null,
    raw: redactSensitive(json),
  };
}

export type AtmosBindConfirmResult = {
  cardToken: string;
  pan?: string | null;
  expiry?: string | null;
  cardHolder?: string | null;
  cardId?: string | null;
  raw: Record<string, unknown>;
};

export async function atmosBindConfirm(
  creds: AtmosCredentials,
  input: { transactionId: string; otp: string },
): Promise<AtmosBindConfirmResult> {
  const { json } = await atmosPost(creds, "/partner/bind-card/confirm", {
    transaction_id: input.transactionId,
    otp: input.otp,
  });
  const code = String((json.result as any)?.code ?? "");
  const data = (json.data ?? {}) as Record<string, unknown>;
  const cardToken = data.card_token;
  if (code !== "OK" || typeof cardToken !== "string" || cardToken === "") {
    throw new AtmosError("atmos_bind_confirm_failed", json);
  }
  return {
    cardToken,
    pan: typeof data.pan === "string" ? data.pan : null,
    expiry: typeof data.expiry === "string" ? data.expiry : null,
    cardHolder: typeof data.card_holder === "string" ? data.card_holder : null,
    cardId: data.card_id != null ? String(data.card_id) : null,
    raw: redactSensitive(json),
  };
}

// ---------------------------------------------------------------------------
// Payment (create -> pre-apply -> apply) and status.
// ---------------------------------------------------------------------------

async function atmosCreate(
  creds: AtmosCredentials,
  input: { amountMinor: number; account: string },
): Promise<{ transactionId: string; json: Record<string, unknown> }> {
  const { json } = await atmosPost(creds, "/merchant/pay/create", {
    amount: input.amountMinor,
    account: input.account,
    store_id: creds.storeId,
  });
  const code = String((json.result as any)?.code ?? "");
  const transactionId = json.transaction_id;
  if (code !== "OK" || transactionId === undefined || transactionId === null) {
    throw new AtmosError("atmos_create_failed", json);
  }
  return { transactionId: String(transactionId), json };
}

async function atmosPreApplyToken(
  creds: AtmosCredentials,
  input: { transactionId: string; cardToken: string },
): Promise<Record<string, unknown>> {
  const { json } = await atmosPost(creds, "/merchant/pay/pre-apply", {
    card_token: input.cardToken,
    store_id: creds.storeId,
    transaction_id: input.transactionId,
  });
  const code = String((json.result as any)?.code ?? "");
  if (code !== "OK") {
    throw new AtmosError("atmos_pre_apply_failed", json);
  }
  return json;
}

async function atmosApply(
  creds: AtmosCredentials,
  input: { transactionId: string; otp: string },
): Promise<Record<string, unknown>> {
  const { json } = await atmosPost(creds, "/merchant/pay/apply", {
    transaction_id: input.transactionId,
    otp: input.otp,
    store_id: creds.storeId,
  });
  return json;
}

/** Status of a finished transaction — the network-loss recovery path. */
export async function atmosGet(
  creds: AtmosCredentials,
  input: { transactionId: string },
): Promise<{ status: AtmosChargeStatus; raw: Record<string, unknown> }> {
  const { json } = await atmosPost(creds, "/merchant/pay/get", {
    store_id: creds.storeId,
    transaction_id: input.transactionId,
  });
  return { status: interpretAtmosStatus(json), raw: redactSensitive(json) };
}

export type AtmosChargeStatus = "succeeded" | "processing" | "failed";

// A charge is settled when store_transaction.confirmed is true with a success
// status_code. Atmos apply is synchronous, so anything else is a failure (there
// is no async-pending state for the inline flow).
function interpretAtmosStatus(json: Record<string, unknown>): AtmosChargeStatus {
  const st = (json.store_transaction ?? {}) as Record<string, unknown>;
  const confirmed = st.confirmed === true;
  const statusCode = st.status_code != null ? String(st.status_code) : "";
  if (confirmed && (statusCode === "0" || statusCode === "")) {
    return "succeeded";
  }
  return "failed";
}

// ---------------------------------------------------------------------------
// Off-session charge with a saved token — used for BOTH the first invoice
// (after binding) and renewals. No cardholder OTP (token pre-apply + apply 111111).
// ---------------------------------------------------------------------------

export type CreateAtmosRecurringChargeInput = {
  supabase: SupabaseClient;
  orgProviderAccountId: string;
  providerToken: string; // card_token
  amountMinor: number;
  account: string; // merchant payment identifier (reconciliation)
};

export type AtmosRecurringChargeResult = {
  providerPaymentId: string | null;
  status: AtmosChargeStatus;
  raw: Record<string, unknown>;
};

export async function createAtmosRecurringCharge(
  input: CreateAtmosRecurringChargeInput,
): Promise<AtmosRecurringChargeResult> {
  const secrets = await getOrgProviderAccountSecrets(input.supabase, input.orgProviderAccountId);
  const creds = parseAtmosCredentials(secrets.credentials_encrypted);

  const created = await atmosCreate(creds, {
    amountMinor: input.amountMinor,
    account: input.account,
  });
  await atmosPreApplyToken(creds, {
    transactionId: created.transactionId,
    cardToken: input.providerToken,
  });
  // When pre-apply used a token, Atmos expects the fixed value 111111 for otp.
  const apply = await atmosApply(creds, {
    transactionId: created.transactionId,
    otp: "111111",
  });

  return {
    providerPaymentId: created.transactionId,
    status: interpretAtmosStatus(apply),
    raw: redactSensitive({ create: created.json, apply }),
  };
}

export function extractAtmosChargeProviderRefs(raw: unknown): {
  transactionId: string | null;
  successTransId: string | null;
} {
  const rec = (raw ?? {}) as Record<string, unknown>;
  const apply = (rec.apply ?? rec) as Record<string, unknown>;
  const st = (apply.store_transaction ?? {}) as Record<string, unknown>;
  return {
    transactionId: apply.transaction_id != null ? String(apply.transaction_id) : null,
    successTransId: st.success_trans_id != null ? String(st.success_trans_id) : null,
  };
}

// ---------------------------------------------------------------------------
// Provider-attempt entry point. Atmos does NO work at provider-select time: the
// card form on pay.krafta.uz drives /atmos/pre-apply and /atmos/apply. We only
// signal that this provider renders inline (no redirect).
// ---------------------------------------------------------------------------

export async function createAtmosAttempt(_ctx: unknown): Promise<ProviderAttemptResult> {
  return { mode: "inline", status: "requires_action" };
}

/** Bind a card (one OTP) and load creds — used by the /atmos/pre-apply route. */
export async function loadAtmosCredentials(
  supabase: SupabaseClient,
  orgProviderAccountId: string,
): Promise<AtmosCredentials> {
  const secrets = await getOrgProviderAccountSecrets(supabase, orgProviderAccountId);
  return parseAtmosCredentials(secrets.credentials_encrypted);
}

export class AtmosError extends Error {
  raw: Record<string, unknown>;
  constructor(code: string, raw: Record<string, unknown>) {
    super(code);
    this.name = "AtmosError";
    // Never retain card data on a thrown error; only the (redacted) provider body.
    this.raw = redactSensitive(raw);
  }
}
