import "server-only";

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

// "Log In With Telegram" (OpenID Connect) for the Krafta SSO identity provider.
// https://core.telegram.org/bots/telegram-login
//
// Unlike the main app — which runs the browser popup and verifies the id_token
// it hands back — auth.krafta.org is a server-side IdP, so it runs the standard
// OIDC *authorization-code* flow: redirect the browser to Telegram, receive a
// `code` on the callback, exchange it for an `id_token` at the token endpoint
// (with the client secret), then verify that JWT here. This sidesteps the
// `post_message` Trusted-Origin subdomain trap entirely.
//
// This module is the trust boundary: it verifies the id_token against
// Telegram's published JWKS and maps the standard claims onto the minimal
// identity shape the session bridge consumes. The RS256/ES256 signature is the
// integrity proof.
//
// Bot owner setup (BotFather → Bot Settings → Web Login): register the Redirect
// URI `https://auth.krafta.org/auth/telegram/callback`, and provide the Client
// ID + Secret as TELEGRAM_LOGIN_CLIENT_ID / TELEGRAM_LOGIN_CLIENT_SECRET.

export const TELEGRAM_ISSUER = "https://oauth.telegram.org";
export const TELEGRAM_AUTH_ENDPOINT = "https://oauth.telegram.org/auth";
export const TELEGRAM_TOKEN_ENDPOINT = "https://oauth.telegram.org/token";
const JWKS_URL = new URL("https://oauth.telegram.org/.well-known/jwks.json");

/** The verified identity, mapped from the id_token's standard OIDC claims. */
export type TelegramIdentity = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
};

export function telegramOidcConfigured(): boolean {
  return Boolean(
    process.env.TELEGRAM_LOGIN_CLIENT_ID &&
      process.env.TELEGRAM_LOGIN_CLIENT_SECRET,
  );
}

export function telegramClientId(): string {
  const id = process.env.TELEGRAM_LOGIN_CLIENT_ID;
  if (!id) throw new Error("TELEGRAM_LOGIN_CLIENT_ID is not set");
  return id;
}

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
  /** Tolerated token age (default 10 min). */
  maxAgeSeconds?: number;
};

/**
 * Verify a Telegram id_token (from the code exchange) and return the identity.
 * Throws on any verification failure (bad signature, wrong issuer/audience,
 * expired, nonce mismatch, malformed claims).
 */
export async function validateTelegramIdToken(
  idToken: string,
  options: ValidateIdTokenOptions,
): Promise<TelegramIdentity> {
  if (!options.clientId) throw new Error("clientId is required");

  // Verify signature + issuer + freshness. Audience is checked by hand below
  // because Telegram may serialize the numeric Client ID as a number, which
  // jose's string-typed `audience` option would not match.
  const { payload } = await jwtVerify(idToken, options.keys ?? remoteJwks(), {
    issuer: TELEGRAM_ISSUER,
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
  };
}
