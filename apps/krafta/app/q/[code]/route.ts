import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import {
  QR_SOURCE_COOKIE,
  QR_SOURCE_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/cart/qr-source-cookie";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

// KRA-26 / KRA-27 — short-link resolver.
//
//   QR encodes:   https://krafta.studio/q/{shortcode}
//   Customer scans → this route → 302 to the catalog with the mode
//   prefilled.
//
//   main      → /{catalog_slug}                          (customer picks mode)
//   table     → /{catalog_slug}?mode=dine_in&table=X
//   pickup    → /{catalog_slug}?mode=pickup
//   delivery  → /{catalog_slug}?mode=delivery
//
// Active QRs are public-readable per the RLS policy. Inactive QRs and
// unknown codes 404. We use the standard 302 (not 301) so destination
// changes — table reassignments, venue moves — take effect on the next
// scan without browsers caching the old redirect.
//
// Side effects on every resolve (KRA-26 follow-up):
//   1. Insert a row into public.qr_scans (fire-and-forget, awaited but
//      we never block the redirect on its failure).
//   2. Set a 15-minute krafta.qr.src cookie carrying the shortcode.
//      lib/cart/orders.ts reads it on first draft-order create and
//      stamps commerce.orders.source='qr_scan'. Cookie is httpOnly +
//      sameSite=lax so it survives Telegram-WebApp's same-site redirect
//      flow but isn't readable from cart-provider client code.
//
// Out of scope:
//   * Telegram-WebApp continuation affordance.

type QrLookup = {
  id: string;
  kind: "main" | "table" | "pickup" | "delivery";
  table_label: string | null;
  // New (KRA-26 follow-up): table QRs prefer the joined tables.label +
  // honor tables.is_active. Legacy table_label is the fallback.
  tables: { label: string; is_active: boolean } | { label: string; is_active: boolean }[] | null;
  catalogs:
    | { id: string; slug: string }
    | { id: string; slug: string }[]
    | null;
};

/** Salt for IP/UA hashing. Per-deployment env var so rotating it breaks
 *  cross-time tracking of returning customers (the point: we don't want
 *  to be able to identify the same person across long windows). Falls
 *  back to a static string in dev so the route doesn't 500 locally. */
const PII_HASH_SALT =
  process.env.KRAFTA_QR_HASH_SALT ?? "krafta-dev-only-fallback-salt";

function hashPII(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256")
    .update(PII_HASH_SALT)
    .update(value)
    .digest("hex")
    .slice(0, 32); // 128 bits is plenty for "unique scanner" bucketing.
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  if (!code || !/^[a-f0-9]{1,32}$/i.test(code)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qr_codes")
    .select(
      "id, kind, table_label, tables(label, is_active), catalogs(id, slug)",
    )
    .eq("shortcode", code)
    .eq("is_active", true)
    .maybeSingle<QrLookup>();

  if (error || !data) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Fire-and-forget scan log. We `await` so an inserter that throws
  // synchronously (e.g. table missing) surfaces in dev logs, but a
  // failure NEVER blocks the redirect — wrap in try/catch.
  // The forwarded-for chain in Vercel runs through their edge proxy;
  // the first hop is the client. node:net could parse and validate but
  // we hash the whole header to keep this dependency-free.
  try {
    const xff = request.headers.get("x-forwarded-for");
    const clientIp = xff ? xff.split(",")[0]?.trim() : null;
    const ua = request.headers.get("user-agent");
    const referrer = request.headers.get("referer");
    await supabase.from("qr_scans").insert({
      qr_code_id: data.id,
      // org_id filled by the BEFORE INSERT trigger.
      org_id: "00000000-0000-0000-0000-000000000000",
      ip_hash: hashPII(clientIp),
      ua_hash: hashPII(ua),
      referrer: referrer ? referrer.slice(0, 512) : null,
    });
  } catch {
    // Don't surface — analytics shouldn't break the customer flow.
  }

  const catalogRel = data.catalogs;
  const catalogRow = Array.isArray(catalogRel) ? catalogRel[0] : catalogRel;
  const catalogSlug = catalogRow?.slug;
  const catalogId = catalogRow?.id;
  if (!catalogSlug || !catalogId) {
    return new NextResponse("Not found", { status: 404 });
  }

  const params = new URLSearchParams();
  // ?qr=<shortcode> is the "fresh scan" signal consumed by cart-provider.
  // It tells the client to treat URL state as authoritative for THIS
  // visit — overriding any stored dine-in lock from a prior scan — so
  // re-scanning a different mode QR actually switches modes. The
  // client strips this param via history.replaceState after one read,
  // so it never persists in the address bar or breaks a shared link.
  params.set("qr", code);
  switch (data.kind) {
    case "main":
      break;
    case "table": {
      // Prefer the joined tables row (new path). Inactive table →
      // soft-fallback to the bare catalog so a moved/deactivated table
      // doesn't 404 a customer mid-meal.
      const tableRel = data.tables;
      const tableRow = Array.isArray(tableRel) ? tableRel[0] : tableRel;
      if (tableRow) {
        if (tableRow.is_active) {
          params.set("mode", "dine_in");
          params.set("table", tableRow.label);
        }
        // is_active=false → leave params empty; customer lands on
        // /{catalog_slug} with the mode picker.
      } else if (data.table_label) {
        // Legacy path: QR predates the tables entity. Trust the
        // denormalized label.
        params.set("mode", "dine_in");
        params.set("table", data.table_label);
      }
      break;
    }
    case "pickup":
      params.set("mode", "pickup");
      break;
    case "delivery":
      params.set("mode", "delivery");
      break;
  }

  const query = params.toString();
  const path = `/${catalogSlug}${query ? `?${query}` : ""}`;

  // Source-attribution cookie: lib/cart/orders.ts reads this when creating the
  // customer's first draft order and stamps source = 'qr_scan'. 15-minute TTL
  // is the "still in the same dining session" window. Set on whichever response
  // we return below (web redirect OR Telegram interstitial).
  const setQrCookie = (res: NextResponse) => {
    res.cookies.set({
      name: QR_SOURCE_COOKIE,
      value: code,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: QR_SOURCE_COOKIE_MAX_AGE_SECONDS,
    });
    return res;
  };

  // Telegram-first entry: when this venue has the Mini App enabled and a
  // platform bot is configured, hand the scan off to Telegram via an
  // interstitial (auto-opens the Mini App; visible web fallback for customers
  // without Telegram). The shortcode rides as `startapp=q_<code>`, which the
  // TMA session expands back to this exact mode + table. tma_enabled is
  // merchant-only data, so read it with the service client. Otherwise keep the
  // original web redirect.
  const botUsername =
    process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim() || null;
  let tmaEnabled = false;
  if (botUsername) {
    const svc = serviceClient();
    if (svc) {
      const { data: venue } = await svc
        .from("venues")
        .select("tma_enabled")
        .eq("catalog_id", catalogId)
        .maybeSingle();
      tmaEnabled = Boolean(venue?.tma_enabled);
    }
  }

  if (tmaEnabled && botUsername) {
    return setQrCookie(
      new NextResponse(
        telegramHandoffHtml({ botUsername, shortcode: code, webPath: path }),
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      ),
    );
  }

  const destination = new URL(path, request.url);
  return setQrCookie(NextResponse.redirect(destination, 302));
}

function serviceClient() {
  const url =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.KRAFTA_SUPABASE_SECRET_KEY ??
    process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createServiceClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}

function htmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Interstitial that hands a QR scan off into the Telegram Mini App. Auto-opens
 * the app via the tg:// deep link (silently no-ops when Telegram isn't
 * installed); if we're still on the page ~1s later, reveals an explicit choice:
 * "Open in Telegram" (https universal link) or "Continue in browser" (the web
 * storefront). Self-contained HTML — no client bundle.
 */
function telegramHandoffHtml(opts: {
  botUsername: string;
  shortcode: string;
  webPath: string;
}): string {
  const startapp = `q_${opts.shortcode}`;
  const httpsLink = `https://t.me/${opts.botUsername}?startapp=${startapp}`;
  const deepLink = `tg://resolve?domain=${opts.botUsername}&startapp=${startapp}`;
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Krafta</title>
<style>
  :root{color-scheme:light dark}
  *{box-sizing:border-box}
  body{margin:0;min-height:100svh;display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fafafa;color:#18181b;padding:24px}
  @media(prefers-color-scheme:dark){body{background:#09090b;color:#fafafa}}
  main{width:100%;max-width:320px;text-align:center}
  .mark{font-weight:600;letter-spacing:-.01em;font-size:20px;margin-bottom:20px}
  .status{font-size:14px;opacity:.6;margin:0}
  .choice{display:none;flex-direction:column;gap:10px;margin-top:18px}
  .choice.show{display:flex}
  .btn{display:block;padding:13px 18px;border-radius:10px;background:#18181b;color:#fafafa;text-decoration:none;font-size:15px;font-weight:500}
  @media(prefers-color-scheme:dark){.btn{background:#fafafa;color:#18181b}}
  .link{font-size:14px;opacity:.65;color:inherit}
</style>
</head>
<body>
<main>
  <div class="mark">krafta</div>
  <p class="status" id="s">Открываем в Telegram…</p>
  <div class="choice" id="c">
    <a class="btn" href="${htmlAttr(httpsLink)}">Открыть в Telegram</a>
    <a class="link" href="${htmlAttr(opts.webPath)}">Продолжить в браузере →</a>
  </div>
</main>
<script>
(function(){
  try{window.location.href=${JSON.stringify(deepLink)}}catch(e){}
  setTimeout(function(){
    if(!document.hidden){
      var s=document.getElementById('s');if(s){s.textContent='Где продолжить заказ?'}
      var c=document.getElementById('c');if(c){c.className='choice show'}
    }
  },1000);
})();
</script>
</body>
</html>`;
}
