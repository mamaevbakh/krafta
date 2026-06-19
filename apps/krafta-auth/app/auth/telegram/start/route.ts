import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";

import { getRequestOrigin } from "@/lib/auth/redirect";
import { sha256Base64Url } from "@/lib/sso";
import {
  TELEGRAM_AUTH_ENDPOINT,
  telegramClientId,
  telegramOidcConfigured,
} from "@/lib/telegram/oidc-login";

// Step 1 of "Continue with Telegram" on the IdP: kick off Telegram's OIDC
// authorization-code flow. We mint a PKCE verifier + CSRF state, stash them
// (plus where to return) in short-lived httpOnly cookies, and redirect the
// browser to Telegram. The callback (../callback) finishes the exchange.

export const STATE_COOKIE = "krafta_tg_state";
export const VERIFIER_COOKIE = "krafta_tg_verifier";
export const NEXT_COOKIE = "krafta_tg_next";
export const TG_COOKIE_PATH = "/auth/telegram";
const COOKIE_TTL_SECONDS = 600;

export async function GET(request: NextRequest) {
  if (!telegramOidcConfigured()) {
    return NextResponse.json({ error: "telegram_not_configured" }, { status: 404 });
  }

  const origin = getRequestOrigin(await headers());
  const next = request.nextUrl.searchParams.get("next") ?? "";

  const verifier = randomBytes(32).toString("base64url");
  const challenge = sha256Base64Url(verifier);
  const state = randomBytes(16).toString("base64url");

  const authUrl = new URL(TELEGRAM_AUTH_ENDPOINT);
  authUrl.searchParams.set("client_id", telegramClientId());
  authUrl.searchParams.set("redirect_uri", `${origin}${TG_COOKIE_PATH}/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(authUrl.toString());
  const opts = {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax" as const, // must be lax: the callback is a top-level cross-site GET
    path: TG_COOKIE_PATH,
    maxAge: COOKIE_TTL_SECONDS,
  };
  res.cookies.set(STATE_COOKIE, state, opts);
  res.cookies.set(VERIFIER_COOKIE, verifier, opts);
  res.cookies.set(NEXT_COOKIE, next, opts);
  return res;
}
