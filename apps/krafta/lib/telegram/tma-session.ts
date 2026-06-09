import "server-only";

import crypto from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { validateTelegramInitData } from "./init-data";

/**
 * tma-session.ts — SECURITY SPINE of the Telegram Mini App.
 *
 * Turns a verified Telegram identity into a Supabase session so the entire
 * existing RLS cart/checkout reuses unchanged. Flow:
 *
 *   verify initData (HMAC, platform bot token)         <- trust established here
 *     -> resolve shop from start_param (catalog slug)
 *     -> stable sub = uuidv5("tg:<telegram_user_id>")  <- one identity per TG user
 *     -> upsert commerce.customers (tg_login)          <- per-org customer row
 *     -> mint ES256 JWT { iss, aud, role, sub, exp }   <- signed w/ our private key
 *
 * Supabase trusts the minted token via Third-Party Auth: it fetches our
 * JWKS (app/api/tma/jwks) by the token's `iss`, finds the key by `kid`,
 * verifies the ES256 signature. RLS then scopes to auth.uid() = sub.
 *
 * Nothing here trusts the client: the telegram_user_id is read ONLY from
 * HMAC-verified initData, never from a client-supplied field.
 */

// Accept initData up to 1h old (launch freshness). The signature proves
// authenticity; auth_date bounds replay.
const INITDATA_MAX_AGE_SECONDS = 60 * 60;
// Minted session lifetime. The client re-mints from initData on expiry.
const ACCESS_TTL_SECONDS = 60 * 60;

// Fixed namespace for uuidv5 derivation. Stable forever — changing it would
// re-key every TMA customer, so it is a constant, never an env var.
const KRAFTA_TMA_NAMESPACE = "9b2e6a3c-1d4f-5e8a-b7c6-0f1a2b3c4d5e";

function adminClient() {
  const url =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.KRAFTA_SUPABASE_SECRET_KEY ??
    process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}

/**
 * Normalize a PEM private key read from an env var. Env stores routinely mangle
 * the multi-line PEM, so we accept every common form and rebuild a clean PEM:
 *   - real multi-line PEM (passthrough),
 *   - `\n`-escaped single line (e.g. dotenv),
 *   - fully collapsed single line (newlines stripped by a dashboard UI),
 *   - base64-encoded whole PEM (the foolproof way to dodge newline issues).
 */
function loadPrivateKeyPem(raw: string): string {
  let v = raw.trim().replace(/\\n/g, "\n");
  // No PEM header → assume the whole PEM was base64-encoded to survive env.
  if (!v.includes("-----BEGIN")) {
    v = Buffer.from(v, "base64").toString("utf8").trim();
  }
  // Rebuild canonical 64-char-wrapped PEM even if the body lost its newlines.
  const m = v.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/);
  if (m) {
    const body = m[2].replace(/\s+/g, "");
    const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
    return `-----BEGIN ${m[1]}-----\n${wrapped}\n-----END ${m[1]}-----`;
  }
  return v;
}

/** RFC 4122 v5 UUID from a fixed namespace + name (deterministic). */
function uuidv5(name: string): string {
  const ns = Buffer.from(KRAFTA_TMA_NAMESPACE.replace(/-/g, ""), "hex");
  const hash = crypto
    .createHash("sha1")
    .update(Buffer.concat([ns, Buffer.from(name, "utf8")]))
    .digest();
  const b = Uint8Array.prototype.slice.call(hash, 0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = Buffer.from(b).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export type TmaSessionResult =
  | {
      ok: true;
      accessToken: string;
      /** Stable auth uid (= JWT sub) the cookie + RLS key off. */
      sub: string;
      expiresIn: number;
      catalogSlug: string;
      /** Fulfillment context decoded from a `q_<shortcode>` QR start_param;
       *  null for plain-slug entries (share link / Main Mini App reopen). */
      mode: "dine_in" | "pickup" | "delivery" | null;
      table: string | null;
    }
  | { ok: false; error: string };

export async function createTmaSession(input: {
  initData: string;
  /** Fallback when initData has no start_param (rare). */
  startParam?: string | null;
}): Promise<TmaSessionResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const privatePem = process.env.TMA_JWT_PRIVATE_KEY;
  const issuer = process.env.TMA_JWT_ISSUER;
  const kid = process.env.TMA_JWT_KID ?? "krafta-tma-78b7bd95";
  if (!botToken || !privatePem || !issuer) {
    return { ok: false, error: "tma_auth_not_configured" };
  }

  // 1. Verify initData — the ONLY source of the telegram identity.
  let data;
  try {
    data = validateTelegramInitData(input.initData, {
      botToken,
      maxAgeSeconds: INITDATA_MAX_AGE_SECONDS,
    });
  } catch {
    return { ok: false, error: "invalid_init_data" };
  }
  const tgUser = data.user;
  if (!tgUser?.id) return { ok: false, error: "no_telegram_user" };
  const telegramUserId = String(tgUser.id);

  const supabase = adminClient();
  if (!supabase) return { ok: false, error: "server_misconfigured" };

  // 2. Resolve the shop from start_param. It's either a plain catalog slug
  //    (share link / Main Mini App reopen) or a `q_<shortcode>` token from a
  //    scanned QR, which we expand to the catalog slug + dine-in/pickup/
  //    delivery context so the storefront opens in the right mode.
  const rawStart = (data.start_param ?? input.startParam ?? "").trim();
  let slug = rawStart;
  let mode: "dine_in" | "pickup" | "delivery" | null = null;
  let table: string | null = null;

  const qrMatch = rawStart.match(/^q_([a-f0-9]{1,32})$/i);
  if (qrMatch) {
    const qr = await resolveQrShortcode(supabase, qrMatch[1]);
    if (qr) {
      slug = qr.slug;
      mode = qr.mode;
      table = qr.table;
    }
  }
  if (!slug) return { ok: false, error: "missing_shop" };

  const { data: catalog } = await supabase
    .from("catalogs")
    .select("id, org_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!catalog) return { ok: false, error: "shop_not_found" };

  const { data: venue } = await supabase
    .from("venues")
    .select("tma_enabled")
    .eq("catalog_id", catalog.id)
    .maybeSingle();
  if (!venue?.tma_enabled) {
    return { ok: false, error: "storefront_not_enabled" };
  }

  // 3. Stable identity + per-org customer. Select-then-insert (not upsert):
  //    the unique index on (org_id, telegram_user_id) is PARTIAL, which
  //    PostgREST upsert onConflict can't target cleanly; and a single
  //    select+insert keeps each write its own transaction (no Promise.all
  //    trigger-race — see the promise-all-rls-trigger-race learning).
  const sub = uuidv5(`tg:${telegramUserId}`);
  const customerId = await resolveCustomer(supabase, {
    orgId: catalog.org_id,
    telegramUserId,
    sub,
    givenName: tgUser.first_name ?? null,
    familyName: tgUser.last_name ?? null,
  });
  if (!customerId) return { ok: false, error: "customer_resolve_failed" };

  // 4. Mint the ES256 session token Supabase will trust (third-party iss).
  let accessToken: string;
  try {
    const key = await importPKCS8(loadPrivateKeyPem(privatePem), "ES256");
    const now = Math.floor(Date.now() / 1000);
    accessToken = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "ES256", kid, typ: "JWT" })
      .setIssuer(issuer)
      .setAudience("authenticated")
      .setSubject(sub)
      .setIssuedAt(now)
      .setExpirationTime(now + ACCESS_TTL_SECONDS)
      .sign(key);
  } catch (err) {
    console.error("[tma-session] mint failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "mint_failed" };
  }

  return {
    ok: true,
    accessToken,
    sub,
    expiresIn: ACCESS_TTL_SECONDS,
    catalogSlug: slug,
    mode,
    table,
  };
}

type QrShortcodeRow = {
  kind: "main" | "table" | "pickup" | "delivery";
  table_label: string | null;
  tables:
    | { label: string; is_active: boolean }
    | { label: string; is_active: boolean }[]
    | null;
  catalogs: { slug: string } | { slug: string }[] | null;
};

/**
 * Expand a QR `q_<shortcode>` token to its catalog slug + fulfillment mode +
 * table. Mirrors the resolution in app/q/[code]/route.ts. Returns null for an
 * unknown / inactive shortcode, in which case the caller treats start_param as
 * a plain slug.
 */
async function resolveQrShortcode(
  supabase: NonNullable<ReturnType<typeof adminClient>>,
  code: string,
): Promise<{
  slug: string;
  mode: "dine_in" | "pickup" | "delivery" | null;
  table: string | null;
} | null> {
  const { data } = await supabase
    .from("qr_codes")
    .select("kind, table_label, tables(label, is_active), catalogs(slug)")
    .eq("shortcode", code)
    .eq("is_active", true)
    .maybeSingle<QrShortcodeRow>();
  if (!data) return null;

  const catRel = data.catalogs;
  const slug = Array.isArray(catRel) ? catRel[0]?.slug : catRel?.slug;
  if (!slug) return null;

  let mode: "dine_in" | "pickup" | "delivery" | null = null;
  let table: string | null = null;
  if (data.kind === "table") {
    const tRel = data.tables;
    const t = Array.isArray(tRel) ? tRel[0] : tRel;
    if (t?.is_active) {
      mode = "dine_in";
      table = t.label;
    } else if (data.table_label) {
      mode = "dine_in";
      table = data.table_label;
    }
  } else if (data.kind === "pickup") {
    mode = "pickup";
  } else if (data.kind === "delivery") {
    mode = "delivery";
  }
  return { slug, mode, table };
}

async function resolveCustomer(
  supabase: NonNullable<ReturnType<typeof adminClient>>,
  args: {
    orgId: string;
    telegramUserId: string;
    sub: string;
    givenName: string | null;
    familyName: string | null;
  },
): Promise<string | null> {
  const sel = () =>
    supabase
      .schema("commerce")
      .from("customers")
      .select("id")
      .eq("org_id", args.orgId)
      .eq("telegram_user_id", args.telegramUserId)
      .maybeSingle();

  const existing = await sel();
  if (existing.data?.id) return existing.data.id;

  const insert = await supabase
    .schema("commerce")
    .from("customers")
    .insert({
      org_id: args.orgId,
      telegram_user_id: args.telegramUserId,
      user_id: args.sub,
      creation_source: "tg_login",
      given_name: args.givenName,
      family_name: args.familyName,
    })
    .select("id")
    .single();

  if (insert.data?.id) return insert.data.id;
  // 23505 = a concurrent first session created the row; re-read and adopt it.
  if ((insert.error as { code?: string } | null)?.code === "23505") {
    const raced = await sel();
    if (raced.data?.id) return raced.data.id;
  }
  console.error("[tma-session] customer insert failed", {
    error: insert.error?.message,
  });
  return null;
}
