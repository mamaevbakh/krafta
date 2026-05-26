import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  QR_SOURCE_COOKIE,
  QR_SOURCE_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/cart/qr-source-cookie";
import { createClient } from "@/lib/supabase/server";

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
  catalogs: { slug: string } | { slug: string }[] | null;
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
    .select("id, kind, table_label, tables(label, is_active), catalogs(slug)")
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
  const catalogSlug = Array.isArray(catalogRel)
    ? catalogRel[0]?.slug
    : catalogRel?.slug;
  if (!catalogSlug) {
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
  const destination = new URL(path, request.url);
  const response = NextResponse.redirect(destination, 302);
  // Source-attribution cookie: lib/cart/orders.ts reads this when
  // creating the customer's first draft order and stamps source =
  // 'qr_scan'. 15-minute TTL is the "still in the same dining session"
  // window; longer windows would mis-attribute next-day repeat orders.
  response.cookies.set({
    name: QR_SOURCE_COOKIE,
    value: code,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: QR_SOURCE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
