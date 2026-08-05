import type { SupabaseClient } from "@supabase/supabase-js";
import { ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";

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

// ---------------------------------------------------------------------------
// Egress proxy. The Atmos gateway (apigw.atmos.uz) only accepts requests from
// IPs the merchant has whitelisted with Atmos; Vercel's function egress IPs are
// dynamic and non-UZ, so every Atmos call is routed through a fixed-IP forward
// proxy whenever ATMOS_EGRESS_PROXY_URL is set. That variable holds a standard
// proxy URL — scheme, host, port, and optionally basic-auth credentials — and
// the proxy's single static IP is the one whitelisted with Atmos.
//
// (Spelled out in prose rather than shown as a sample URL: an inline
// scheme://user:pass@host literal, however obviously fake, trips the
// credential scanner on every push.)
//
// Unset (e.g. local dev on an already-whitelisted network) → calls go out
// directly, unchanged. Built once and reused.
// ---------------------------------------------------------------------------
let cachedEgressDispatcher: Dispatcher | null | undefined;
function getEgressDispatcher(): Dispatcher | undefined {
  if (cachedEgressDispatcher === undefined) {
    const proxyUrl = process.env.ATMOS_EGRESS_PROXY_URL?.trim();
    cachedEgressDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : null;
  }
  return cachedEgressDispatcher ?? undefined;
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
  const res = await undiciFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    dispatcher: getEgressDispatcher(),
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

export type AtmosVerifyResult =
  | { ok: true }
  | { ok: false; reason: "auth_failed" | "unreachable" };

/**
 * Best-effort credential probe used at connect time. Hits the OAuth token
 * endpoint and classifies the outcome:
 *  - ok           → Atmos issued a token; the key/secret are valid.
 *  - auth_failed  → a well-formed HTTP response with no token; Atmos rejected
 *                   the credentials (wrong key/secret/store).
 *  - unreachable  → DNS/connect/timeout/abort. The Atmos gateway is IP/geo-
 *                   fenced (`apigw.atmos.uz` is only reachable from whitelisted
 *                   UZ networks), so a merchant on a valid contract can still be
 *                   connected from a non-whitelisted deploy — the caller decides
 *                   whether to persist a `verified: false` connection.
 * Never throws; never logs card data (there is none here).
 */
export async function verifyAtmosCredentials(
  creds: AtmosCredentials,
  opts?: { timeoutMs?: number },
): Promise<AtmosVerifyResult> {
  const basic = Buffer.from(
    `${creds.consumerKey}:${creds.consumerSecret}`,
  ).toString("base64");
  const url = `${normalizeBaseUrl(creds.apiBaseUrl)}/token?grant_type=client_credentials`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 8000);
  try {
    const res = await undiciFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: controller.signal,
      dispatcher: getEgressDispatcher(),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && typeof json.access_token === "string" && json.access_token !== "") {
      return { ok: true };
    }
    return { ok: false, reason: "auth_failed" };
  } catch {
    return { ok: false, reason: "unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}

async function atmosPost(
  creds: AtmosCredentials,
  path: string,
  body: Record<string, unknown>,
): Promise<{ httpStatus: number; json: Record<string, unknown> }> {
  const token = await getAtmosAccessToken(creds);
  const url = `${normalizeBaseUrl(creds.apiBaseUrl)}${path}`;
  const res = await undiciFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    dispatcher: getEgressDispatcher(),
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

export type AtmosCardDetails = {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
};

// BIN ranges for the card networks Atmos settles: Uzcard/Humo (UZ domestic
// rails) plus international Visa/Mastercard. `pan` from bind-card/confirm is
// already partner-masked (e.g. "986009******1840") but keeps the leading
// digits, so this works on both masked and unmasked values.
function detectCardBrandFromPan(pan: string | null | undefined): string | null {
  if (!pan) return null;
  const digits = pan.replace(/\D/g, "");
  if (digits.startsWith("8600")) return "uzcard";
  if (digits.startsWith("9860")) return "humo";
  if (digits.startsWith("4")) return "visa";
  if (/^5[1-5]/.test(digits) || /^2(2[2-9]|[3-6]\d|7[01])/.test(digits)) return "mastercard";
  return null;
}

// Atmos's `expiry` field is documented as "YYmm" (e.g. "2505" = May 2025),
// NOT "MM/YY" — confirmed against the bind-card/confirm sample response.
function parseAtmosExpiry(expiry: string | null | undefined): {
  expMonth: number | null;
  expYear: number | null;
} {
  const digits = (expiry ?? "").replace(/\D/g, "");
  if (digits.length !== 4) return { expMonth: null, expYear: null };
  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  if (!Number.isInteger(mm) || mm < 1 || mm > 12) return { expMonth: null, expYear: null };
  return { expMonth: mm, expYear: 2000 + yy };
}

export function atmosCardDetailsFromBindResult(bind: AtmosBindConfirmResult): AtmosCardDetails {
  const { expMonth, expYear } = parseAtmosExpiry(bind.expiry);
  const last4 = bind.pan ? bind.pan.replace(/\D/g, "").slice(-4) : "";
  return {
    brand: detectCardBrandFromPan(bind.pan),
    last4: last4 || null,
    expMonth,
    expYear,
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

// A failed Atmos call reaches a route two ways: a thrown `AtmosError` carrying
// the provider's `result.code`, or a plain transport error (fetch timeout, DNS/
// connect failure, or the OAuth token step failing) when the gateway is
// unreachable. The pay page must NOT tell a cardholder their card is wrong for an
// Atmos internal glitch or a network blip — only for codes that genuinely mean
// the card details are bad. Callers map this kind onto their own copy:
//   card_invalid  the cardholder must fix the PAN/expiry (ERR-009 wrong params,
//                 ERR-067 wrong card).
//   temporary     an Atmos internal error (ERR-001 "Внутренняя ошибка") or any
//                 transport/timeout failure — retryable, not the card's fault.
//   other         any other Atmos result code (e.g. a genuine charge decline or
//                 a store-config error); the caller keeps its own default copy.
export type AtmosFailureKind = "card_invalid" | "temporary" | "declined" | "other";

// Match on the trailing "ERR-0NN" token so a partner prefix ("STPIMS-ERR-009")
// or a bare "ERR-009" both classify. Atmos codes are 3-digit and non-overlapping.
const ATMOS_CARD_INVALID_CODES = ["ERR-009", "ERR-067"] as const;
const ATMOS_TEMPORARY_CODES = ["ERR-001"] as const;

/**
 * The bank looked at the card and said no. Nothing was taken.
 *
 * This is a different thing from `other`, and the difference is worth money.
 * `other` means we do not know what happened, so the intent is deliberately
 * left `processing` for the reconciler rather than reset — resetting could hide
 * a real charge. A DECLINE carries no such doubt: Atmos told us the card was
 * refused, so no money moved and the payment can safely be marked failed and
 * offered again.
 *
 * Without this distinction ERR-112 fell into `other`, and a customer whose card
 * simply had no money on it was shown "we couldn't complete the payment", while
 * the payment itself sat in limbo forever — the reconciler will not touch it
 * (it cannot prove what happened), and a settled intent cannot be retried. The
 * customer reads that as "the code I typed was wrong", and tries again into a
 * dead end.
 *
 * ERR-112 — "Недостаточно средств на балансе карты для проведения платежа".
 */
const ATMOS_DECLINED_CODES = ["ERR-112"] as const;

function atmosResultCode(raw: Record<string, unknown> | null | undefined): string | null {
  const code = (raw as { result?: { code?: unknown } } | null)?.result?.code;
  return typeof code === "string" && code.trim() !== "" ? code.toUpperCase() : null;
}

export function classifyAtmosFailure(error: unknown): AtmosFailureKind {
  // A non-AtmosError reached us as a raw throw: fetch timeout, DNS/connect
  // failure, or the token step failing. The gateway is at fault, never the card.
  if (!(error instanceof AtmosError)) return "temporary";
  const code = atmosResultCode(error.raw);
  if (!code) return "temporary";
  if (ATMOS_CARD_INVALID_CODES.some((c) => code.includes(c))) return "card_invalid";
  if (ATMOS_TEMPORARY_CODES.some((c) => code.includes(c))) return "temporary";
  if (ATMOS_DECLINED_CODES.some((c) => code.includes(c))) return "declined";
  return "other";
}
