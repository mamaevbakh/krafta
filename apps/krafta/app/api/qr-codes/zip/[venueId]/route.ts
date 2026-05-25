import { Resvg } from "@resvg/resvg-js";
import JSZip from "jszip";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getRequestOrigin } from "@/lib/auth/redirect";
import { renderQrSvg } from "@/lib/qr/render";
import { createClient } from "@/lib/supabase/server";

/**
 * Bulk-download every active table QR for a venue as a single ZIP of
 * PNGs. Files inside the zip are named "{table-label-slug}.png" so the
 * merchant can print them straight away without renaming.
 *
 * Auth: the request-scoped Supabase client carries the merchant's
 * session; RLS on public.tables enforces org membership, so a
 * non-member who guesses a venue UUID gets an empty zip + 200 (rather
 * than a 403 — no info leak).
 */

const PNG_SIZE = 1024;

export async function GET(
  request: Request,
  context: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(venueId)) {
    return NextResponse.json({ error: "invalid venue id" }, { status: 400 });
  }

  const supabase = await createClient();

  // Pull venue (for the zip filename) + every active table for it,
  // joined with the paired QR's shortcode. RLS on tables already
  // scopes by org membership.
  const { data: venue } = await supabase
    .from("venues")
    .select("id, name, catalog_id, catalogs(slug)")
    .eq("id", venueId)
    .maybeSingle();
  if (!venue) {
    return NextResponse.json({ error: "venue not found" }, { status: 404 });
  }

  const { data: tables, error: tablesErr } = await supabase
    .from("tables")
    .select("id, label, qr_codes(id, shortcode, is_active)")
    .eq("venue_id", venueId)
    .eq("is_active", true)
    .order("position", { ascending: true });
  if (tablesErr) {
    return NextResponse.json({ error: tablesErr.message }, { status: 500 });
  }
  if (!tables || tables.length === 0) {
    return NextResponse.json({ error: "no tables to download" }, { status: 404 });
  }

  const origin = getRequestOrigin(await headers());
  const zip = new JSZip();

  for (const t of tables) {
    const qrRel = Array.isArray(t.qr_codes) ? t.qr_codes[0] : t.qr_codes;
    if (!qrRel || !qrRel.is_active) continue;

    const url = `${origin}/q/${qrRel.shortcode}`;
    const svg = await renderQrSvg(url, { size: PNG_SIZE });
    // Resvg ships a WASM rasterizer — no native deps, Vercel-friendly.
    // fitTo=width with PNG_SIZE keeps the output square at our intended
    // print resolution.
    const png = new Resvg(svg, {
      fitTo: { mode: "width", value: PNG_SIZE },
      background: "#ffffff",
    })
      .render()
      .asPng();

    const fileName = `${slugify(t.label)}.png`;
    zip.file(fileName, png);
  }

  // JSZip's nodebuffer/uint8array outputs trip TS's BodyInit overload
  // narrowing in Next 16. arraybuffer is the cleanest acceptable shape;
  // NextResponse passes it through to the underlying Response.
  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
  const catalogSlug = Array.isArray(venue.catalogs)
    ? venue.catalogs[0]?.slug
    : venue.catalogs?.slug;
  const zipName = `${catalogSlug ?? venue.name ?? "venue"}-tables-qrs.zip`;

  return new NextResponse(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Cache-Control": "no-store",
    },
  });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
