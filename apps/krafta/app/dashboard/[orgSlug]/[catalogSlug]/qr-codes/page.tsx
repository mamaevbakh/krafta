import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getRequestOrigin } from "@/lib/auth/redirect";
import { renderQrSvg } from "@/lib/qr/render";

import { QrCodesPanel } from "./_components/qr-codes-panel";

/**
 * Merchant QR-codes page. Shows three "mode" QR cards (main / pickup /
 * delivery) at the top + a per-table list below. SVGs are rendered
 * server-side so the page loads with QR images already inlined — no
 * client-side render flash, no extra round-trips.
 *
 * Per-table QR previews are also pre-rendered server-side; PNG downloads
 * happen client-side by rasterizing the SVG via canvas. The ZIP "download
 * all" route lives at /api/qr-codes/zip/[venueId] (Slice 5).
 */

type RouteParams = { orgSlug: string; catalogSlug: string };

export default async function QrCodesPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { orgSlug, catalogSlug } = await params;
  const supabase = await createClient();

  // Resolve catalog → venue. Org membership is already gated by the
  // dashboard layout above us; venue belongs to the catalog 1:1.
  const { data: catalog } = await supabase
    .from("catalogs")
    .select("id, name, slug, org_id, organizations!inner(slug)")
    .eq("slug", catalogSlug)
    .eq("organizations.slug", orgSlug)
    .maybeSingle();
  if (!catalog) notFound();

  const { data: venue } = await supabase
    .from("venues")
    .select("id, name, modes_enabled")
    .eq("catalog_id", catalog.id)
    .maybeSingle();
  if (!venue) notFound();

  // Mode QRs (main / pickup / delivery) auto-created via the venue
  // trigger; pull them keyed by kind so the panel can index directly.
  const [{ data: modeQrs }, { data: tables }] = await Promise.all([
    supabase
      .from("qr_codes")
      .select("id, kind, shortcode, is_active")
      .eq("venue_id", venue.id)
      .in("kind", ["main", "pickup", "delivery"])
      .order("kind"),
    supabase
      .from("tables")
      .select(
        "id, label, position, is_active, qr_codes(id, shortcode, is_active)",
      )
      .eq("venue_id", venue.id)
      .order("position", { ascending: true }),
  ]);

  // Build the absolute QR URL using the request origin. localhost / prod
  // both work — the origin reflects whichever host the merchant is on.
  const origin = getRequestOrigin(await headers());

  // Pre-render SVGs server-side for fast first paint. Mode QRs are
  // keyed by kind; table QRs by table id.
  const modeQrPayload = await Promise.all(
    (modeQrs ?? []).map(async (qr) => ({
      kind: qr.kind as "main" | "pickup" | "delivery",
      qrId: qr.id,
      shortcode: qr.shortcode,
      url: `${origin}/q/${qr.shortcode}`,
      svg: await renderQrSvg(`${origin}/q/${qr.shortcode}`),
      isActive: qr.is_active,
    })),
  );

  const tablePayload = await Promise.all(
    (tables ?? []).map(async (t) => {
      const qrRel = Array.isArray(t.qr_codes) ? t.qr_codes[0] : t.qr_codes;
      const shortcode = qrRel?.shortcode ?? "";
      const url = shortcode ? `${origin}/q/${shortcode}` : "";
      return {
        id: t.id,
        label: t.label,
        position: t.position,
        isActive: t.is_active,
        qrId: qrRel?.id ?? null,
        shortcode,
        url,
        svg: shortcode ? await renderQrSvg(url) : null,
      };
    }),
  );

  return (
    <QrCodesPanel
      catalogId={catalog.id}
      catalogName={catalog.name}
      catalogSlug={catalog.slug}
      venueId={venue.id}
      venueName={venue.name}
      modesEnabled={venue.modes_enabled as string[]}
      modeQrs={modeQrPayload}
      tables={tablePayload}
    />
  );
}
