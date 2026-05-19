import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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
// Out of scope (follow-ups):
//   * qr_scans event log + scan→order attribution token.
//   * Telegram-WebApp continuation affordance.

type QrLookup = {
  kind: "main" | "table" | "pickup" | "delivery";
  table_label: string | null;
  catalogs: { slug: string } | { slug: string }[] | null;
};

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
    .select("kind, table_label, catalogs(slug)")
    .eq("shortcode", code)
    .eq("is_active", true)
    .maybeSingle<QrLookup>();

  if (error || !data) {
    return new NextResponse("Not found", { status: 404 });
  }

  const catalogRel = data.catalogs;
  const catalogSlug = Array.isArray(catalogRel)
    ? catalogRel[0]?.slug
    : catalogRel?.slug;
  if (!catalogSlug) {
    return new NextResponse("Not found", { status: 404 });
  }

  const params = new URLSearchParams();
  switch (data.kind) {
    case "main":
      break;
    case "table":
      params.set("mode", "dine_in");
      if (data.table_label) params.set("table", data.table_label);
      break;
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
  return NextResponse.redirect(destination, 302);
}
