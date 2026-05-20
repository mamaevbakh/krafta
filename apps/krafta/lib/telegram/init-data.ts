import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// Telegram WebApp initData validation per the spec:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
// 1. Parse initData (URL-encoded query string) into key/value pairs.
// 2. Extract `hash`; treat the remaining pairs as the data-check.
// 3. data_check_string = pairs sorted by key, joined as "key=value\n".
// 4. secret_key = HMAC_SHA256("WebAppData", bot_token).
// 5. expected = hex(HMAC_SHA256(secret_key, data_check_string)).
// 6. Compare with constant-time equality.
// 7. Reject if auth_date is older than `maxAgeSeconds` (default 24h).
//
// Used by:
//   - The Telegram login surface (KRA-46).
//   - The TMA route handler when the customer opens /tma/[slug] inside
//     Telegram (KRA-47) — initData is provided automatically by the
//     Telegram WebApp container.

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
};

export type TelegramInitData = {
  user?: TelegramUser;
  receiver?: TelegramUser;
  chat?: {
    id: number;
    type: string;
    title?: string;
    username?: string;
    photo_url?: string;
  };
  start_param?: string;
  can_send_after?: number;
  auth_date: number;
  hash: string;
  // Any other pairs Telegram appends in the future.
  raw: Record<string, string>;
};

export type ValidateOptions = {
  /**
   * Bot token to derive the signing key. Must be the same bot whose
   * Mini App the customer is using.
   */
  botToken: string;
  /**
   * Maximum age in seconds for `auth_date` to be considered fresh.
   * Default: 24 hours. Telegram's spec recommends rejecting older data
   * to limit replay windows.
   */
  maxAgeSeconds?: number;
  /**
   * Override `Date.now()` for tests / time-travel scenarios. Pass a
   * unix timestamp in seconds.
   */
  nowSeconds?: number;
};

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;

export function validateTelegramInitData(
  initData: string,
  options: ValidateOptions,
): TelegramInitData {
  const { botToken } = options;
  const maxAge = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (!botToken) throw new Error("botToken is required");
  if (!initData) throw new Error("initData is empty");

  const params = new URLSearchParams(initData);
  const providedHash = params.get("hash");
  if (!providedHash) throw new Error("initData is missing `hash`");
  params.delete("hash");

  // Build data_check_string: pairs sorted by key, joined as "key=value\n".
  // Values stay URL-decoded (URLSearchParams.get returns decoded). Telegram
  // signs the decoded values per spec.
  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => entries.push([key, value]));
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = entries
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHashHex = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const providedBuf = Buffer.from(providedHash, "hex");
  const expectedBuf = Buffer.from(expectedHashHex, "hex");
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    throw new Error("initData signature is invalid");
  }

  const authDateStr = params.get("auth_date");
  if (!authDateStr) throw new Error("initData is missing `auth_date`");
  const authDate = Number(authDateStr);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new Error("initData `auth_date` is malformed");
  }
  if (now - authDate > maxAge) {
    throw new Error("initData is expired");
  }

  const rawUser = params.get("user");
  const rawReceiver = params.get("receiver");
  const rawChat = params.get("chat");

  return {
    user: rawUser ? (JSON.parse(rawUser) as TelegramUser) : undefined,
    receiver: rawReceiver
      ? (JSON.parse(rawReceiver) as TelegramUser)
      : undefined,
    chat: rawChat ? JSON.parse(rawChat) : undefined,
    start_param: params.get("start_param") ?? undefined,
    can_send_after: params.get("can_send_after")
      ? Number(params.get("can_send_after"))
      : undefined,
    auth_date: authDate,
    hash: providedHash,
    raw: Object.fromEntries(entries),
  };
}
