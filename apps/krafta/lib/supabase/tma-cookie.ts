import "server-only";

import { decodeJwt } from "jose";

/**
 * tma-cookie.ts — install a verified Telegram Mini App session into the
 * canonical `@supabase/ssr` auth cookie, so the ENTIRE existing storefront
 * stack (RSC server client, browser client, realtime) authenticates the
 * Telegram shopper with no further changes.
 *
 * Why hand-write the cookie instead of `supabase.auth.setSession()`?
 * Our token is a third-party-auth JWT — signed by Krafta's own key and trusted
 * by Supabase via JWKS, NOT issued by GoTrue. auth-js's `setSession()` /
 * `getUser()` route through GoTrue, which only validates Supabase-issued
 * tokens and rejects ours. But auth-js's session *recovery* path
 * (`__loadSession`) trusts a non-expired session straight from storage with no
 * network call — so dropping a correctly-encoded session cookie makes every
 * data request carry our token, and RLS validates it at PostgREST via JWKS.
 *
 * This module reproduces `@supabase/ssr`'s exact on-disk format:
 *   key   = `sb-<project-ref>-auth-token`   (supabase-js defaultStorageKey)
 *   value = `base64-` + base64url(JSON.stringify(session))
 *   opts  = DEFAULT_COOKIE_OPTIONS (path "/", sameSite "lax", httpOnly false)
 * The reader strips the `base64-` prefix regardless of the client's configured
 * encoding, so this is robust across both clients. Payload is ~1 KB — well
 * under the 3180-byte chunk threshold, so it is always a single cookie.
 */

const BASE64_PREFIX = "base64-";

export type SupabaseCookie = {
  name: string;
  value: string;
  options: {
    path: string;
    sameSite: "lax";
    httpOnly: false;
    maxAge: number;
  };
};

/** `sb-<project-ref>-auth-token` — must match supabase-js's defaultStorageKey. */
export function supabaseAuthCookieName(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  const ref = new URL(url).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
}

/**
 * Build the Set-Cookie payload for a minted TMA access token. The value is an
 * `@supabase/ssr`-encoded auth-js Session object; auth-js reads it back as the
 * current session and attaches `access_token` to every PostgREST/Realtime
 * request.
 */
export function buildTmaSessionCookie(args: {
  accessToken: string;
  sub: string;
  expiresIn: number;
}): SupabaseCookie {
  const claims = decodeJwt(args.accessToken);
  const expiresAt =
    typeof claims.exp === "number"
      ? claims.exp
      : Math.floor(Date.now() / 1000) + args.expiresIn;

  // Minimal but complete auth-js Session shape. `refresh_token` is empty: there
  // is no refresh flow — the Mini App re-mints from fresh initData on expiry,
  // and the cookie's maxAge tracks the token so a stale entry self-expires
  // rather than triggering a dead refresh.
  const session = {
    access_token: args.accessToken,
    refresh_token: "",
    token_type: "bearer",
    expires_in: args.expiresIn,
    expires_at: expiresAt,
    user: {
      id: args.sub,
      aud: "authenticated",
      role: "authenticated",
      app_metadata: { provider: "telegram", providers: ["telegram"] },
      user_metadata: {},
    },
  };

  const value =
    BASE64_PREFIX +
    Buffer.from(JSON.stringify(session), "utf8").toString("base64url");

  return {
    name: supabaseAuthCookieName(),
    value,
    options: {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      maxAge: args.expiresIn,
    },
  };
}
