/**
 * /api/tma/session — exchange verified Telegram initData for a Supabase
 * session the existing RLS cart/checkout can use.
 *
 * The client (inside the Telegram webview) POSTs the raw initData string
 * from window.Telegram.WebApp; we verify it (HMAC, platform bot token),
 * resolve the shopper to a per-org customer, and mint an ES256 session
 * token. The browser then calls supabase.auth.setSession() with it.
 *
 * Public route by necessity (it IS the auth bootstrap) — but it trusts
 * nothing: a forged or stale initData is rejected by the HMAC + auth_date
 * check inside createTmaSession. No token is ever returned for unverified
 * data.
 */

import { NextRequest, NextResponse } from "next/server";

import { createTmaSession } from "@/lib/telegram/tma-session";
import { buildTmaSessionCookie } from "@/lib/supabase/tma-cookie";

export async function POST(req: NextRequest) {
  let body: { initData?: unknown; startParam?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const initData = typeof body.initData === "string" ? body.initData : "";
  const startParam =
    typeof body.startParam === "string" ? body.startParam : null;
  if (!initData) {
    return NextResponse.json({ error: "missing_init_data" }, { status: 400 });
  }

  const result = await createTmaSession({ initData, startParam });
  if (!result.ok) {
    // 401 for auth failures, 400 for shop/config problems — both opaque.
    const authErrors = new Set([
      "invalid_init_data",
      "no_telegram_user",
      "tma_auth_not_configured",
      "mint_failed",
    ]);
    const status = authErrors.has(result.error) ? 401 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  // Install the minted token as the canonical Supabase auth cookie. The
  // browser never touches the raw token — the existing storefront (RSC server
  // client, browser client, realtime) reads this cookie and authenticates the
  // Telegram shopper. The client just needs the slug to navigate to the shop.
  const cookie = buildTmaSessionCookie({
    accessToken: result.accessToken,
    sub: result.sub,
    expiresIn: result.expiresIn,
  });

  const res = NextResponse.json({
    catalog_slug: result.catalogSlug,
    expires_in: result.expiresIn,
  });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
