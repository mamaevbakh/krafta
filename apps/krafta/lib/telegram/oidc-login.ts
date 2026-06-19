import "server-only";

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

import type { TelegramLoginPayload } from "./login-widget";

// "Log In With Telegram" — the NEW OpenID Connect flow that replaces the
// legacy iframe Login Widget (see login-widget.ts, which validates the old
// HMAC payload). https://core.telegram.org/bots/telegram-login
//
// The browser library (oauth.telegram.org/js/telegram-login.js) runs the
// popup + PKCE and hands the page an `id_token` — an OIDC JWT. This module is
// the trust boundary: it verifies that JWT against Telegram's published JWKS
// and maps the standard claims onto the SAME `TelegramLoginPayload` shape the
// session bridge (lib/auth/telegram-bridge.ts) already consumes, so the
// downstream provision/mint path is unchanged. The `hash` field has no analog
// here — the RS256/ES256 signature verified below IS the integrity proof.
//
// Setup the bot owner does once (BotFather → Bot Settings → Web Login):
// register the Allowed URLs and obtain the Client ID. The Client ID is the
// JWT `aud`; pass it in via NEXT_PUBLIC_TELEGRAM_CLIENT_ID. No client secret
// is needed for this id_token path (that is only for the server-side
// authorization-code exchange).

const ISSUER = "https://oauth.telegram.org";
const JWKS_URL = new URL("https://oauth.telegram.org/.well-known/jwks.json");

// One cached remote key set per process — jose fetches + caches the JWKS and
// refreshes on unknown `kid` (key rotation) internally.
let remote: ReturnType<typeof createRemoteJWKSet> | null = null;
function remoteJwks(): JWTVerifyGetKey {
  return (remote ??= createRemoteJWKSet(JWKS_URL));
}

export type ValidateIdTokenOptions = {
  /** Bot Client ID from BotFather's Web Login — the id_token `aud`. */
  clientId: string;
  /** Server-issued nonce echoed back in the token; rejects replays. Omit to skip. */
  nonce?: string;
  /** Test seam: override the key source. Defaults to Telegram's remote JWKS. */
  keys?: Parameters<typeof jwtVerify>[1];
  /** Tolerated token age (default 10 min, matching the legacy widget). */
  maxAgeSeconds?: number;
};

/**
 * Verify a Telegram "Log In With Telegram" id_token and return it as a
 * TelegramLoginPayload. Throws on any verification failure (bad signature,
 * wrong issuer/audience, expired, nonce mismatch, malformed claims).
 */
export async function validateTelegramIdToken(
  idToken: string,
  options: ValidateIdTokenOptions,
): Promise<TelegramLoginPayload> {
  if (!options.clientId) throw new Error("clientId is required");

  // Verify signature + issuer + freshness. Audience is checked by hand below
  // because Telegram may serialize the numeric Client ID as a number, which
  // jose's string-typed `audience` option would not match.
  const { payload } = await jwtVerify(idToken, options.keys ?? remoteJwks(), {
    issuer: ISSUER,
    maxTokenAge: `${options.maxAgeSeconds ?? 600}s`,
  });

  const aud = payload.aud;
  const want = String(options.clientId);
  const audOk = Array.isArray(aud)
    ? aud.map(String).includes(want)
    : String(aud) === want;
  if (!audOk) throw new Error("id_token `aud` does not match clientId");

  if (options.nonce && payload.nonce !== options.nonce) {
    throw new Error("id_token `nonce` does not match");
  }

  const id = Number(payload.sub);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("id_token `sub` is malformed");
  }
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name) throw new Error("id_token `name` is missing");

  return {
    id,
    first_name: name,
    username:
      typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : undefined,
    photo_url:
      typeof payload.picture === "string" ? payload.picture : undefined,
    auth_date:
      typeof payload.iat === "number"
        ? payload.iat
        : Math.floor(Date.now() / 1000),
    hash: "",
  };
}
