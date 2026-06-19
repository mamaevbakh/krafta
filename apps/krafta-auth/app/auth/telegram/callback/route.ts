import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies, headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import {
  getRequestOrigin,
  normalizeNextPath,
  toAbsoluteRedirectUrl,
} from "@/lib/auth/redirect";
import { secureCompareText } from "@/lib/sso";
import { signInTelegramIdentity } from "@/lib/telegram/bridge";
import {
  TELEGRAM_TOKEN_ENDPOINT,
  telegramClientId,
  telegramOidcConfigured,
  validateTelegramIdToken,
} from "@/lib/telegram/oidc-login";
import {
  NEXT_COOKIE,
  STATE_COOKIE,
  TG_COOKIE_PATH,
  VERIFIER_COOKIE,
} from "../start/route";

// Step 2: Telegram redirected back with `?code=&state=`. Verify the state,
// exchange the code for an id_token (confidential client: client_secret_post +
// PKCE verifier), verify the id_token, resolve it to a Supabase session, and
// bounce to the original /authorize URL — which now sees a logged-in user and
// issues the SSO code to the client app.

function fail(origin: string, reason: string) {
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(reason)}`,
  );
}

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(await headers());
  const params = request.nextUrl.searchParams;
  const cookieStore = await cookies();

  const savedState = cookieStore.get(STATE_COOKIE)?.value;
  const verifier = cookieStore.get(VERIFIER_COOKIE)?.value;
  const nextRaw = cookieStore.get(NEXT_COOKIE)?.value ?? "";

  // One-shot: clear the flow cookies no matter how this resolves.
  for (const name of [STATE_COOKIE, VERIFIER_COOKIE, NEXT_COOKIE]) {
    cookieStore.set(name, "", { path: TG_COOKIE_PATH, maxAge: 0 });
  }

  if (!telegramOidcConfigured()) {
    return fail(origin, "Telegram sign-in is not configured.");
  }

  const oauthError = params.get("error");
  if (oauthError) {
    return fail(origin, params.get("error_description") || oauthError);
  }

  const code = params.get("code");
  const state = params.get("state");
  if (
    !code ||
    !state ||
    !savedState ||
    !verifier ||
    !secureCompareText(state, savedState)
  ) {
    return fail(origin, "Telegram sign-in could not be verified. Please try again.");
  }

  // Exchange the authorization code for an id_token.
  let idToken: string | undefined;
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}${TG_COOKIE_PATH}/callback`,
      client_id: telegramClientId(),
      client_secret: process.env.TELEGRAM_LOGIN_CLIENT_SECRET ?? "",
      code_verifier: verifier,
    });
    const tokenRes = await fetch(TELEGRAM_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    if (!tokenRes.ok) {
      console.error("[telegram-callback] token exchange failed", {
        status: tokenRes.status,
      });
      return fail(origin, "Telegram sign-in failed. Please try again.");
    }
    const tokens = (await tokenRes.json()) as { id_token?: string };
    idToken = tokens.id_token;
  } catch (error) {
    console.error("[telegram-callback] token exchange error", error);
    return fail(origin, "Telegram sign-in failed. Please try again.");
  }
  if (!idToken) {
    return fail(origin, "Telegram sign-in failed. Please try again.");
  }

  // Verify the id_token, then resolve it to a logged-in Supabase session.
  let tg;
  try {
    tg = await validateTelegramIdToken(idToken, { clientId: telegramClientId() });
  } catch (error) {
    console.error("[telegram-callback] id_token invalid", error);
    return fail(origin, "Telegram sign-in could not be verified. Please try again.");
  }

  const supabase = await createClient();
  const result = await signInTelegramIdentity(supabase, tg);
  if ("error" in result) {
    return fail(origin, "Sign-in failed. Please try again.");
  }

  const dest = normalizeNextPath(nextRaw || null, origin, "/dashboard");
  return NextResponse.redirect(toAbsoluteRedirectUrl(dest, origin));
}
