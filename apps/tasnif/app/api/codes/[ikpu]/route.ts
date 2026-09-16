import { getCodeDetails } from "@/lib/search"

/**
 * GET /api/codes/10202001010000002
 *
 * Everything a receipt needs for one code: names, category path, units,
 * barcode, benefit, and the package codes. Switched-off codes answer too, with
 * status "inactive", because people paste them from old invoices.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/codes/[ikpu]">) {
  const { ikpu } = await params
  if (!/^\d{17}$/.test(ikpu)) {
    return Response.json({ error: "invalid_code" }, { status: 400 })
  }
  try {
    const details = await getCodeDetails(ikpu)
    if (!details) return Response.json({ error: "not_found" }, { status: 404 })
    return Response.json(details, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    })
  } catch (error) {
    console.error("tasnif: code details failed", error)
    return Response.json({ error: "details_failed" }, { status: 502 })
  }
}
