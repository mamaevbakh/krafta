import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Telegram Login Widget payload validation per the (legacy-widget) spec:
// https://core.telegram.org/widgets/login-legacy#checking-authorization
//
// 1. The widget's data-onauth callback hands the page a flat user object:
//    { id, first_name, last_name?, username?, photo_url?, auth_date, hash }.
// 2. data_check_string = all received fields except `hash`, sorted by key,
//    joined as "key=<value>" lines.
// 3. secret_key = SHA256(bot_token)   <-- NOT the Mini App derivation:
//    initData uses HMAC_SHA256(key="WebAppData", msg=bot_token); the two
//    validators are siblings on purpose (see init-data.ts).
// 4. expected = hex(HMAC_SHA256(secret_key, data_check_string)); compare
//    constant-time.
// 5. auth_date bounds replay: the payload is consumed by the same in-page
//    flow that produced it, so the freshness window is clock-skew headroom,
//    not a session lifetime (ADR 0006 security analysis).
//
// Used by the KRA-46 merchant login bridge (lib/auth/telegram-bridge.ts).
// The telegram user id must enter the system from HERE and nowhere else.

export type TelegramLoginPayload = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

export type ValidateLoginOptions = {
  /** Token of the bot the widget is configured for (data-telegram-login). */
  botToken: string;
  /** Freshness window for auth_date. Default 10 minutes. */
  maxAgeSeconds?: number;
  /** Tolerated forward clock skew. Default 60 seconds. */
  maxSkewSeconds?: number;
  /** Override now (unix seconds) for tests. */
  nowSeconds?: number;
};

const DEFAULT_MAX_AGE_SECONDS = 10 * 60;
const DEFAULT_MAX_SKEW_SECONDS = 60;

/**
 * Validates a Login Widget payload and returns it typed. Throws on any
 * verification failure. The input is the raw object the widget callback
 * produced (all received fields participate in the check string — including
 * any Telegram adds in the future — so pass it through unfiltered).
 */
export function validateTelegramLoginPayload(
  payload: Record<string, unknown>,
  options: ValidateLoginOptions,
): TelegramLoginPayload {
  const { botToken } = options;
  const maxAge = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const maxSkew = options.maxSkewSeconds ?? DEFAULT_MAX_SKEW_SECONDS;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (!botToken) throw new Error("botToken is required");
  if (!payload || typeof payload !== "object") {
    throw new Error("payload must be an object");
  }

  const providedHash = payload.hash;
  if (typeof providedHash !== "string" || !/^[a-f0-9]{64}$/i.test(providedHash)) {
    throw new Error("payload is missing `hash`");
  }

  // Build the check string from every received field except `hash`. Values
  // are stringified the way Telegram serialized them into the signed data:
  // numbers/strings verbatim. Reject non-scalar values outright — the widget
  // never sends nested data, so any object here is a forgery attempt.
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(payload)) {
    if (key === "hash" || value === undefined || value === null) continue;
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new Error(`payload field \`${key}\` is not a scalar`);
    }
    entries.push([key, String(value)]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = entries
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const expectedHashHex = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const providedBuf = Buffer.from(providedHash, "hex");
  const expectedBuf = Buffer.from(expectedHashHex, "hex");
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    throw new Error("login payload signature is invalid");
  }

  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new Error("login payload `auth_date` is malformed");
  }
  if (now - authDate > maxAge) {
    throw new Error("login payload is expired");
  }
  if (authDate - now > maxSkew) {
    throw new Error("login payload `auth_date` is in the future");
  }

  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("login payload `id` is malformed");
  }
  const firstName = payload.first_name;
  if (typeof firstName !== "string" || !firstName) {
    throw new Error("login payload `first_name` is missing");
  }

  return {
    id,
    first_name: firstName,
    last_name: typeof payload.last_name === "string" ? payload.last_name : undefined,
    username: typeof payload.username === "string" ? payload.username : undefined,
    photo_url: typeof payload.photo_url === "string" ? payload.photo_url : undefined,
    auth_date: authDate,
    hash: providedHash,
  };
}
