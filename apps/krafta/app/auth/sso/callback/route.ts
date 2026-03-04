import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyState } from "@krafta/auth-sso";
import {
  getSsoAuthBaseUrl,
  getSsoClientId,
  getSsoClientSecret,
  getSsoStateSecret,
  hasSsoRuntimeConfig,
  SSO_CODE_VERIFIER_COOKIE,
  SSO_COOKIE_PATH,
  SSO_STATE_COOKIE,
} from "@/lib/auth/sso";
import { normalizeNextPath } from "@/lib/auth/redirect";

type TokenResponse =
  | {
      handoff_redirect_url: string;
      token_type: "handoff";
      expires_in: number;
    }
  | { error?: string; error_description?: string };

function buildErrorRedirect(requestOrigin: string, next: string, message: string) {
  const loginUrl = new URL("/login", requestOrigin);
  loginUrl.searchParams.set("next", next);
  loginUrl.searchParams.set("error", message);
  return loginUrl.toString();
}

export async function GET(request: NextRequest) {
  const requestOrigin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  const verifierCookie = request.cookies.get(SSO_CODE_VERIFIER_COOKIE)?.value;
  const stateCookie = request.cookies.get(SSO_STATE_COOKIE)?.value;

  const clearAndRedirect = (url: string) => {
    const response = NextResponse.redirect(url);
    response.cookies.delete({
      name: SSO_CODE_VERIFIER_COOKIE,
      path: SSO_COOKIE_PATH,
    });
    response.cookies.delete({
      name: SSO_STATE_COOKIE,
      path: SSO_COOKIE_PATH,
    });
    return response;
  };

  if (
    !hasSsoRuntimeConfig() ||
    !code ||
    !state ||
    !verifierCookie ||
    !stateCookie
  ) {
    return clearAndRedirect(
      buildErrorRedirect(requestOrigin, "/dashboard", "sso_callback_invalid"),
    );
  }

  if (state !== stateCookie) {
    return clearAndRedirect(
      buildErrorRedirect(requestOrigin, "/dashboard", "sso_state_mismatch"),
    );
  }

  const payload = await verifyState(state, getSsoStateSecret());
  if (!payload || payload.clientId !== getSsoClientId()) {
    return clearAndRedirect(
      buildErrorRedirect(requestOrigin, "/dashboard", "sso_state_invalid"),
    );
  }

  if (Date.now() - payload.iat > 10 * 60 * 1000) {
    return clearAndRedirect(
      buildErrorRedirect(requestOrigin, "/dashboard", "sso_state_expired"),
    );
  }

  const redirectUri = `${requestOrigin}/auth/sso/callback`;
  const tokenResponse = await fetch(new URL("/token", getSsoAuthBaseUrl()), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifierCookie,
      client_id: getSsoClientId(),
      client_secret: getSsoClientSecret(),
    }),
    cache: "no-store",
  });

  const tokenPayload = (await tokenResponse.json().catch(() => null)) as TokenResponse | null;
  if (!tokenResponse.ok || !tokenPayload || !("handoff_redirect_url" in tokenPayload)) {
    return clearAndRedirect(
      buildErrorRedirect(requestOrigin, payload.next, "sso_token_exchange_failed"),
    );
  }

  let handoffUrl: URL;
  try {
    handoffUrl = new URL(tokenPayload.handoff_redirect_url);
  } catch {
    return clearAndRedirect(
      buildErrorRedirect(requestOrigin, payload.next, "sso_handoff_url_invalid"),
    );
  }

  if (handoffUrl.origin !== requestOrigin) {
    return clearAndRedirect(
      buildErrorRedirect(requestOrigin, payload.next, "sso_handoff_origin_invalid"),
    );
  }

  const safeNext = normalizeNextPath(payload.next, requestOrigin, "/dashboard");
  if (handoffUrl.searchParams.get("next") !== safeNext) {
    handoffUrl.searchParams.set("next", safeNext);
  }

  return clearAndRedirect(handoffUrl.toString());
}
