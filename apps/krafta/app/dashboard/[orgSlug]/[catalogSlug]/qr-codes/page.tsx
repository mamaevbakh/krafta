import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getRequestOrigin } from "@/lib/auth/redirect";
import { renderQrSvg } from "@/lib/qr/render";

import { QrCodesPanel } from "./_components/qr-codes-panel";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Returns scan counts per qr_code_id for the given venue.
 *
 * Two counts: lifetime + last 7 days. Postgrest doesn't expose
 * GROUP BY directly through the REST client, so we pull the (id,
 * scanned_at) tuples in two date-bucketed queries and aggregate in JS.
 * Cheap for v1 scale (a busy launch venue is <10k scans/week); upgrade
 * to a database view if a real merchant ever exceeds that.
 *
 * Returns a map: qr_code_id → { total, last7 }. Missing keys = no scans.
 */
async function fetchScanCounts(
  supabase: SupabaseServerClient,
  venueId: string,
): Promise<Map<string, { total: number; last7: number }>> {
  // Fetch qr_code_ids for this venue first so the scans query can be
  // RLS-friendly without exposing other venues' qr_scans rows.
  const { data: venueQrs } = await supabase
    .from("qr_codes")
    .select("id")
    .eq("venue_id", venueId);
  const qrIds = (venueQrs ?? []).map((q) => q.id);
  if (qrIds.length === 0) return new Map();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: scans } = await supabase
    .from("qr_scans")
    .select("qr_code_id, scanned_at")
    .in("qr_code_id", qrIds);

  const counts = new Map<string, { total: number; last7: number }>();
  for (const row of scans ?? []) {
    const entry = counts.get(row.qr_code_id) ?? { total: 0, last7: 0 };
    entry.total += 1;
    if (row.scanned_at >= sevenDaysAgo) entry.last7 += 1;
    counts.set(row.qr_code_id, entry);
  }
  return counts;
}

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
  // Scan counts are aggregated separately (qr_scans rows → in-memory
  // map) so the qr_codes select stays simple.
  const [{ data: modeQrs }, { data: tables }, scanCountsByQrId] =
    await Promise.all([
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
      fetchScanCounts(supabase, venue.id),
    ]);

  // Build the absolute QR URL using the request origin. localhost / prod
  // both work — the origin reflects whichever host the merchant is on.
  const origin = getRequestOrigin(await headers());

  // Pre-render SVGs server-side for fast first paint. Mode QRs are
  // keyed by kind; table QRs by table id. Scan counts are joined in
  // from the aggregate map; absent qr_code_ids default to {0, 0}.
  const modeQrPayload = await Promise.all(
    (modeQrs ?? []).map(async (qr) => {
      const counts = scanCountsByQrId.get(qr.id) ?? { total: 0, last7: 0 };
      return {
        kind: qr.kind as "main" | "pickup" | "delivery",
        qrId: qr.id,
        shortcode: qr.shortcode,
        url: `${origin}/q/${qr.shortcode}`,
        svg: await renderQrSvg(`${origin}/q/${qr.shortcode}`),
        isActive: qr.is_active,
        scanCountTotal: counts.total,
        scanCountLast7: counts.last7,
      };
    }),
  );

  const tablePayload = await Promise.all(
    (tables ?? []).map(async (t) => {
      const qrRel = Array.isArray(t.qr_codes) ? t.qr_codes[0] : t.qr_codes;
      const shortcode = qrRel?.shortcode ?? "";
      const url = shortcode ? `${origin}/q/${shortcode}` : "";
      const counts = qrRel?.id
        ? scanCountsByQrId.get(qrRel.id) ?? { total: 0, last7: 0 }
        : { total: 0, last7: 0 };
      return {
        id: t.id,
        label: t.label,
        position: t.position,
        isActive: t.is_active,
        qrId: qrRel?.id ?? null,
        shortcode,
        url,
        svg: shortcode ? await renderQrSvg(url) : null,
        scanCountTotal: counts.total,
        scanCountLast7: counts.last7,
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
